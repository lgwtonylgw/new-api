import { describe, expect, test } from 'vitest'

import { readImageGenerationResponse } from '../image-response'

describe('playground image generation', () => {
  test('reads a completed image from an SSE stream with a heartbeat', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        for (const part of [
          ': ping\r\n\r\nevent: image_generation.completed\r\n',
          'data: {"type":"image_generation.completed","b64_json":"iVBORw0KGgo="}\r\n\r',
          '\ndata: [DONE]\n\n',
        ]) {
          controller.enqueue(encoder.encode(part))
        }
        controller.close()
      },
    })
    const response = new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
    await expect(readImageGenerationResponse(response)).resolves.toEqual([
      'data:image/png;base64,iVBORw0KGgo=',
    ])
  })

  test('reads a URL from a non-streaming image response', async () => {
    const response = Response.json({
      data: [{ url: 'https://example.com/generated.png' }],
    })
    await expect(readImageGenerationResponse(response)).resolves.toEqual([
      'https://example.com/generated.png',
    ])
  })

  test('rejects an ended stream that did not deliver an image', async () => {
    const response = new Response('data: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    })
    await expect(readImageGenerationResponse(response)).rejects.toThrow(
      'No image was returned'
    )
  })

  test('surfaces an upstream SSE error', async () => {
    const response = new Response(
      'event: error\ndata: {"error":{"message":"Image generation failed"}}\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } }
    )
    await expect(readImageGenerationResponse(response)).rejects.toThrow(
      'Image generation failed'
    )
  })
})
