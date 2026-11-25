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
import { describe, expect, test } from 'vitest'

import { DEFAULT_CONFIG } from '../../../constants'
import {
  loadConfig,
  loadMessages,
  saveConfig,
  saveMessages,
} from '../../storage/storage'
import {
  buildImageGenerationPayload,
  getImageSettings,
  IMAGE_SIZE_PRESETS,
} from '../image-generation'

describe('image generation parameters', () => {
  test('image preferences and generation metadata survive the existing storage format', () => {
    localStorage.clear()
    const config = {
      ...DEFAULT_CONFIG,
      model: 'gpt-image-2',
      image: { ratio: '16:9' as const, resolution: '4K' as const, count: 2 },
    }
    saveConfig(config)
    expect(loadConfig()).toMatchObject(config)
    const request = buildImageGenerationPayload('A cat', config)
    saveMessages([
      {
        key: 'saved',
        from: 'assistant',
        versions: [{ id: 'v', content: '' }],
        status: 'complete',
        images: ['https://example.com/image.png'],
        imageGeneration: request,
      },
    ])
    expect(loadMessages()?.[0]).toMatchObject({
      images: ['https://example.com/image.png'],
      imageGeneration: request,
    })
    localStorage.clear()
  })
  test('sends the selected size, quality, count and current prompt without chat parameters', () => {
    const request = buildImageGenerationPayload('  A cat  ', {
      ...DEFAULT_CONFIG,
      model: 'gpt-image-2',
      image: {
        ratio: '16:9',
        resolution: '4K',
        quality: 'high',
        count: 2,
        style: 'none',
      },
    })
    expect(request).toEqual({
      model: 'gpt-image-2',
      group: 'default',
      prompt: 'A cat',
      size: '3840x2160',
      quality: 'high',
      n: 2,
      stream: true,
    })
  })

  test('uses upstream defaults unless parameters were explicitly selected', () => {
    expect(buildImageGenerationPayload('A cat', DEFAULT_CONFIG)).toEqual({
      model: DEFAULT_CONFIG.model,
      group: 'default',
      prompt: 'A cat',
      n: 1,
      stream: true,
    })
  })

  test('falls back to standard dimensions when switching away from GPT Image 2', () => {
    const config = {
      ...DEFAULT_CONFIG,
      model: 'gpt-image-1.5',
      image: {
        ratio: '16:9' as const,
        resolution: '4K' as const,
        quality: 'auto' as const,
        count: 1,
        style: 'none' as const,
      },
    }
    expect(getImageSettings(config)).toMatchObject({
      ratio: 'auto',
      resolution: '1K',
    })
    expect(buildImageGenerationPayload('A cat', config)).not.toHaveProperty(
      'size'
    )
  })

  test('all high resolution presets respect GPT Image 2 pixel and edge limits', () => {
    for (const sizes of Object.values(IMAGE_SIZE_PRESETS)) {
      for (const size of sizes) {
        const [width, height] = size.split('x').map(Number)
        expect(width % 16).toBe(0)
        expect(height % 16).toBe(0)
        expect(Math.max(width, height)).toBeLessThanOrEqual(3840)
        expect(width * height).toBeLessThanOrEqual(8_294_400)
        expect(width * height).toBeGreaterThanOrEqual(655_360)
      }
    }
  })

  test('invalid stored counts fall back to one and selected styles are explicit in the prompt', () => {
    const config = {
      ...DEFAULT_CONFIG,
      image: { count: 999, style: 'cinematic' as const },
    }
    expect(buildImageGenerationPayload('A cat', config)).toMatchObject({
      n: 1,
      prompt: expect.stringContaining('A cat\n\n'),
    })
    expect(buildImageGenerationPayload('A cat', config).prompt).toContain(
      'cinematic'
    )
  })
})
