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
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../constants'
import type { Message } from '../../types'
import { useChatHandler } from '../use-chat-handler'

const originalAuth = useAuthStore.getState().auth
const initialMessages: Message[] = [
  {
    key: 'previous',
    from: 'assistant',
    versions: [{ id: 'old', content: 'Previous chat reply' }],
    images: ['data:image/png;base64,iVBORw0KGgo='],
    status: 'complete',
  },
  {
    key: 'prompt',
    from: 'user',
    versions: [{ id: 'prompt-v', content: 'A cat' }],
  },
  {
    key: 'answer',
    from: 'assistant',
    versions: [{ id: 'answer-v', content: '' }],
    status: 'loading',
    startedAt: Date.now(),
  },
]

beforeEach(() => {
  useAuthStore.setState({
    auth: {
      ...originalAuth,
      accessToken: 'test-session-token',
      accessExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.setState({ auth: originalAuth })
})

function useImageConversation() {
  const [messages, setMessages] = useState(initialMessages)
  const handler = useChatHandler({
    config: {
      ...DEFAULT_CONFIG,
      model: 'gpt-image-2',
      image: { ratio: '16:9', resolution: '4K', quality: 'high', count: 2 },
    },
    mode: 'image',
    parameterEnabled: DEFAULT_PARAMETER_ENABLED,
    onMessageUpdate: setMessages,
  })
  return { ...handler, messages }
}

test('image generation sends only the latest prompt and preserves parameters with returned images', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      data: [
        { url: 'https://example.com/one.png' },
        { url: 'https://example.com/two.png' },
      ],
    })
  )
  vi.stubGlobal('fetch', fetchMock)
  const { result } = renderHook(useImageConversation)
  act(() => result.current.sendChat(result.current.messages))
  await waitFor(() =>
    expect(result.current.messages.at(-1)?.status).toBe('complete')
  )
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toBe('/pg/images/generations')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    model: 'gpt-image-2',
    group: 'default',
    prompt: 'A cat',
    n: 2,
    size: '3840x2160',
    quality: 'high',
    stream: true,
  })
  expect(result.current.messages.at(-1)).toMatchObject({
    imageGeneration: {
      model: 'gpt-image-2',
      size: '3840x2160',
      n: 2,
      prompt: 'A cat',
    },
    images: ['https://example.com/one.png', 'https://example.com/two.png'],
  })
})

test('stopping an image request aborts waiting and late results do not overwrite the interrupted state', async () => {
  let finish!: (value: Response) => void
  const response = new Promise<Response>((resolve) => {
    finish = resolve
  })
  const fetchMock = vi.fn().mockReturnValue(response)
  vi.stubGlobal('fetch', fetchMock)
  const { result } = renderHook(useImageConversation)
  act(() => result.current.sendChat(result.current.messages))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  act(() => result.current.stopGeneration())
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  expect(result.current.messages.at(-1)).toMatchObject({
    status: 'error',
    errorCode: 'generation_interrupted',
  })
  await act(async () => {
    finish(Response.json({ data: [{ url: 'https://example.com/late.png' }] }))
  })
  expect(result.current.messages.at(-1)).toMatchObject({
    status: 'error',
    errorCode: 'generation_interrupted',
  })
  expect(result.current.messages.at(-1)?.images).toBeUndefined()
  expect(result.current.isGenerating).toBe(false)
})

test('a failed later image keeps the image already received in the conversation', async () => {
  let streamController!: ReadableStreamDefaultController<Uint8Array>
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
      controller.enqueue(
        encoder.encode(
          'data: {"type":"image_generation.completed","url":"https://example.com/one.png"}\n\n'
        )
      )
    },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
    )
  )
  const { result } = renderHook(useImageConversation)
  act(() => result.current.sendChat(result.current.messages))
  await waitFor(() =>
    expect(result.current.messages.at(-1)?.images).toEqual([
      'https://example.com/one.png',
    ])
  )
  expect(result.current.isGenerating).toBe(true)
  act(() => {
    streamController.enqueue(
      encoder.encode('data: {"error":{"message":"Second image failed"}}\n\n')
    )
    streamController.close()
  })
  await waitFor(() =>
    expect(result.current.messages.at(-1)?.status).toBe('error')
  )
  expect(result.current.messages.at(-1)?.images).toEqual([
    'https://example.com/one.png',
  ])
  expect(result.current.isGenerating).toBe(false)
})
