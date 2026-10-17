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
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { Turnstile } from './turnstile'

afterEach(() => {
  delete window.turnstile
  document.querySelector('#cf-turnstile')?.remove()
})

it('renders every waiting widget when the shared script finishes loading', () => {
  const first = render(<Turnstile siteKey='site' onVerify={vi.fn()} />)
  const second = render(<Turnstile siteKey='site' onVerify={vi.fn()} />)
  expect(document.querySelectorAll('#cf-turnstile')).toHaveLength(1)
  const renderWidget = vi
    .fn()
    .mockReturnValueOnce('one')
    .mockReturnValueOnce('two')
  const remove = vi.fn()
  window.turnstile = { render: renderWidget, remove }
  const script = document.querySelector('#cf-turnstile')
  if (!script) throw new Error('Turnstile script was not mounted')
  fireEvent.load(script)
  expect(renderWidget).toHaveBeenCalledTimes(2)
  first.unmount()
  second.unmount()
  expect(remove.mock.calls).toEqual([['one'], ['two']])
})

it('uses the current callbacks without rendering a duplicate widget', () => {
  let options: Record<string, unknown> = {}
  const renderWidget = vi.fn((_element, nextOptions) => {
    options = nextOptions
    return 'one'
  })
  window.turnstile = { render: renderWidget, remove: vi.fn() }
  const oldCallback = vi.fn()
  const latestCallback = vi.fn()
  const expired = vi.fn()
  const view = render(<Turnstile siteKey='site' onVerify={oldCallback} />)
  view.rerender(
    <Turnstile siteKey='site' onVerify={latestCallback} onExpire={expired} />
  )
  act(() => (options.callback as (token: string) => void)('token'))
  act(() => (options['expired-callback'] as () => void)())
  expect(oldCallback).not.toHaveBeenCalled()
  expect(latestCallback).toHaveBeenCalledWith('token')
  expect(expired).toHaveBeenCalledOnce()
  expect(renderWidget).toHaveBeenCalledOnce()
})

it('lets the visitor retry a script loading failure', () => {
  const expired = vi.fn()
  render(<Turnstile siteKey='site' onVerify={vi.fn()} onExpire={expired} />)
  const script = document.querySelector('#cf-turnstile')
  if (!script) throw new Error('Turnstile script was not mounted')
  fireEvent.error(script)
  expect(expired).toHaveBeenCalledOnce()
  expect(screen.getByRole('alert')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(document.querySelector('#cf-turnstile')).toBeInTheDocument()
})
