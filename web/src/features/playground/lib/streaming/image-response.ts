import { ERROR_MESSAGES } from '../../constants'
import { parseStreamErrorDetails } from './stream-utils'

type ImagePayload = {
  type?: string
  url?: unknown
  b64_json?: unknown
  data?: ImagePayload | ImagePayload[]
  error?: { message?: string }
}

function safeRemoteImage(value: unknown): string | undefined {
  if (typeof value !== 'string') return
  try {
    const url = new URL(value)
    if (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    ) {
      return url.href
    }
  } catch {
    return
  }
}

function imageSource(payload: ImagePayload): string | undefined {
  const base64 = payload?.b64_json
  if (typeof base64 === 'string' && /^[A-Za-z0-9+/]+=*$/.test(base64)) {
    const formats = [
      ['iVBORw0KGgo', 'png'],
      ['/9j/', 'jpeg'],
      ['UklGR', 'webp'],
    ]
    const format = formats.find(([signature]) => base64.startsWith(signature))
    if (format) return `data:image/${format[1]};base64,${base64}`
  }
  return safeRemoteImage(payload?.url)
}

function collectImages(payload: ImagePayload): string[] {
  const entries = Array.isArray(payload.data)
    ? payload.data
    : [payload.data ?? payload]
  return entries.flatMap((entry) => {
    const src = imageSource(entry)
    return src ? [src] : []
  })
}

async function readImageStream(
  body: ReadableStream<Uint8Array>
): Promise<string[]> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const images = new Set<string>()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      if (done && buffer) frames.push(buffer)
      for (const frame of frames) {
        const lines = frame.split(/\r?\n/)
        const data = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n')
        if (!data) continue
        if (data === '[DONE]') continue

        if (lines.some((line) => /^event:\s*error\s*$/.test(line))) {
          throw new Error(parseStreamErrorDetails(data).errorMessage)
        }
        const payload = JSON.parse(data) as ImagePayload
        if (payload.error) {
          throw new Error(
            payload.error.message || ERROR_MESSAGES.API_REQUEST_ERROR
          )
        }
        if (payload.type === 'image_generation.completed') {
          for (const src of collectImages(payload)) images.add(src)
        }
      }
      if (done) return [...images]
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export async function readImageGenerationResponse(
  response: Response
): Promise<string[]> {
  if (!response.ok) {
    const text = await response.text()
    const details = parseStreamErrorDetails(text)
    throw new Error(
      details.errorMessage === text
        ? `HTTP ${response.status}`
        : details.errorMessage
    )
  }

  let images: string[]
  if (
    response.headers.get('Content-Type')?.includes('text/event-stream') &&
    response.body
  ) {
    images = await readImageStream(response.body)
  } else {
    const payload = (await response.json()) as ImagePayload
    if (payload.error) {
      throw new Error(payload.error.message || ERROR_MESSAGES.API_REQUEST_ERROR)
    }
    images = collectImages(payload)
  }
  if (!images.length) throw new Error(ERROR_MESSAGES.EMPTY_IMAGE)
  return [...new Set(images)]
}
