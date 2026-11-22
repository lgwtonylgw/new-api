/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleServerError } from '@/lib/handle-server-error'

import { getHomePageContent } from '../api'
import { useHomePageContent } from '../hooks/use-home-page-content'
import type { HomePageContentResponse } from '../types'

vi.mock('../api', () => ({ getHomePageContent: vi.fn() }))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: vi.fn() }))

function pendingContentRequest() {
  let resolve!: (response: HomePageContentResponse) => void
  const promise = new Promise<HomePageContentResponse>((finish) => {
    resolve = finish
  })
  vi.mocked(getHomePageContent).mockReturnValue(promise)
  return resolve
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(getHomePageContent).mockReset()
})

afterEach(() => {
  localStorage.clear()
})

describe('home content cache', () => {
  it.each(['# Cached home', 'https://home.example/page', ''])(
    'shows cached content before the request finishes: %j',
    (content) => {
      localStorage.setItem('home_page_content', content)
      pendingContentRequest()

      const { result } = renderHook(useHomePageContent)

      expect(result.current).toMatchObject({ content, isLoaded: true })
      expect(getHomePageContent).toHaveBeenCalledOnce()
    }
  )

  it('updates the visible cache after a successful background refresh', async () => {
    localStorage.setItem('home_page_content', '# Cached home')
    const finish = pendingContentRequest()
    const { result } = renderHook(useHomePageContent)

    await act(async () => finish({ success: true, data: '# Updated home' }))

    expect(result.current).toMatchObject({
      content: '# Updated home',
      isLoaded: true,
    })
    expect(localStorage.getItem('home_page_content')).toBe('# Updated home')
  })

  it('waits for the first response when there is no cache', async () => {
    const finish = pendingContentRequest()
    const { result } = renderHook(useHomePageContent)
    expect(result.current.isLoaded).toBe(false)

    await act(async () => finish({ success: true, data: '# First home' }))

    expect(result.current).toMatchObject({
      content: '# First home',
      isLoaded: true,
    })
  })

  it('remembers the default home page when the server clears custom content', async () => {
    localStorage.setItem('home_page_content', '# Old custom home')
    vi.mocked(getHomePageContent).mockResolvedValue({ success: true, data: '' })
    const { result, unmount } = renderHook(useHomePageContent)
    await waitFor(() => expect(result.current.content).toBe(''))
    expect(localStorage.getItem('home_page_content')).toBe('')
    unmount()
    pendingContentRequest()

    const nextVisit = renderHook(useHomePageContent)

    expect(nextVisit.result.current).toMatchObject({
      content: '',
      isLoaded: true,
    })
  })

  it.each(['network', 'business'] as const)(
    'keeps cached content when a %s failure interrupts refresh',
    async (failure) => {
      localStorage.setItem('home_page_content', '# Cached home')
      if (failure === 'network') {
        vi.mocked(getHomePageContent).mockRejectedValue(new Error('offline'))
      } else {
        vi.mocked(getHomePageContent).mockResolvedValue({
          success: false,
          message: 'Unavailable',
        })
      }

      const { result } = renderHook(useHomePageContent)

      await waitFor(() => expect(handleServerError).toHaveBeenCalledOnce())
      expect(result.current).toMatchObject({
        content: '# Cached home',
        isLoaded: true,
      })
      expect(localStorage.getItem('home_page_content')).toBe('# Cached home')
    }
  )

  it('falls back to the default home after a failed first request', async () => {
    vi.mocked(getHomePageContent).mockRejectedValue(new Error('offline'))
    const { result } = renderHook(useHomePageContent)

    await waitFor(() => expect(result.current.isLoaded).toBe(true))

    expect(result.current.content).toBe('')
  })

  it.each(['getItem', 'setItem'] as const)(
    'can load the home page when storage %s is unavailable',
    async (method) => {
      vi.spyOn(localStorage, method).mockImplementation(() => {
        throw new Error('Storage unavailable')
      })
      vi.mocked(getHomePageContent).mockResolvedValue({
        success: true,
        data: '# Fresh home',
      })
      const { result } = renderHook(useHomePageContent)

      await waitFor(() => expect(result.current.isLoaded).toBe(true))

      expect(result.current.content).toBe('# Fresh home')
      expect(handleServerError).not.toHaveBeenCalled()
    }
  )

  it('does not overwrite the cache after the page unmounts', async () => {
    localStorage.setItem('home_page_content', '# Cached home')
    const finish = pendingContentRequest()
    const { unmount } = renderHook(useHomePageContent)
    unmount()

    await act(async () => finish({ success: true, data: '# Stale request' }))

    expect(localStorage.getItem('home_page_content')).toBe('# Cached home')
  })
})
