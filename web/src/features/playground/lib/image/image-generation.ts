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
import type {
  ImageGenerationRequest,
  ImageSettings,
  PlaygroundConfig,
} from '../../types'

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  ratio: 'auto',
  resolution: '1K',
  quality: 'auto',
  count: 1,
  style: 'none',
}

// GPT Image 2: 16px alignment, <=3840px per edge, <=8,294,400 pixels.
// https://developers.openai.com/api/docs/guides/image-generation
// The resolution tier is a pixel budget, not a promise of a 4096px edge.
export const IMAGE_SIZE_PRESETS = {
  '1:1': ['1024x1024', '2048x2048', '2880x2880'],
  '3:2': ['1536x1024', '2304x1536', '3456x2304'],
  '2:3': ['1024x1536', '1536x2304', '2304x3456'],
  '16:9': ['1536x864', '2048x1152', '3840x2160'],
  '9:16': ['864x1536', '1152x2048', '2160x3840'],
  '4:3': ['1152x864', '2048x1536', '3264x2448'],
  '3:4': ['864x1152', '1536x2048', '2448x3264'],
  '21:9': ['1792x768', '2688x1152', '3808x1632'],
} as const

export const IMAGE_STYLES = [
  { value: 'none', label: 'No style preset', prompt: '' },
  {
    value: 'cinematic',
    label: 'Cinematic',
    prompt:
      'Use cinematic lighting, realistic materials and a carefully composed film-like scene.',
  },
  {
    value: 'illustration',
    label: 'Illustration',
    prompt:
      'Use a polished editorial illustration style, expressive shapes and a harmonious color palette.',
  },
  {
    value: 'product',
    label: 'Product photography',
    prompt:
      'Use professional product photography, clean studio lighting and a minimal background.',
  },
  {
    value: 'watercolor',
    label: 'Watercolor',
    prompt:
      'Use a watercolor illustration style with soft washes, delicate brushwork and paper texture.',
  },
] as const

export const IMAGE_PROMPT_EXAMPLES = [
  'A cinematic mountain landscape at sunrise, soft mist and warm light',
  'A minimalist product photo of a ceramic coffee cup on a warm beige background',
  'A watercolor illustration of a small bookshop on a rainy street',
  'A modern poster with bold typography and a blue and orange geometric composition',
] as const

export function supportsFlexibleImageSizes(model: string): boolean {
  return /(?:^|\/)gpt-image-2(?:$|[-.])/i.test(model)
}

export function getImageSettings(config: PlaygroundConfig): ImageSettings {
  const settings = { ...DEFAULT_IMAGE_SETTINGS, ...config.image }
  const flexible = supportsFlexibleImageSizes(config.model)
  const standardRatio = ['auto', '1:1', '3:2', '2:3'].includes(settings.ratio)
  return {
    ...settings,
    ratio: flexible || standardRatio ? settings.ratio : 'auto',
    resolution:
      flexible && settings.ratio !== 'auto' ? settings.resolution : '1K',
    count:
      Number.isInteger(settings.count) &&
      settings.count >= 1 &&
      settings.count <= 10
        ? settings.count
        : 1,
  }
}

export function getImageSize(settings: ImageSettings): string | undefined {
  if (settings.ratio === 'auto') return undefined
  const tier = { '1K': 0, '2K': 1, '4K': 2 }[settings.resolution]
  return IMAGE_SIZE_PRESETS[settings.ratio]?.[tier]
}

export function buildImageGenerationPayload(
  prompt: string,
  config: PlaygroundConfig
): ImageGenerationRequest {
  const settings = getImageSettings(config)
  const style = IMAGE_STYLES.find((option) => option.value === settings.style)
  const size = getImageSize(settings)
  return {
    model: config.model,
    group: config.group,
    prompt: style?.prompt
      ? `${prompt.trim()}\n\n${style.prompt}`
      : prompt.trim(),
    stream: true,
    n: settings.count,
    ...(size && { size }),
    ...(settings.quality !== 'auto' && { quality: settings.quality }),
  }
}
