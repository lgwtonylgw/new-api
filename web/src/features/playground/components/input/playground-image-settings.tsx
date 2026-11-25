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
import { ImageIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  getImageSettings,
  getImageSize,
  IMAGE_SIZE_PRESETS,
  IMAGE_STYLES,
  supportsFlexibleImageSizes,
} from '../../lib/image/image-generation'
import type { PlaygroundConfig } from '../../types'

type PlaygroundImageSettingsProps = {
  config: PlaygroundConfig
  disabled?: boolean
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
}

export function PlaygroundImageSettings(props: PlaygroundImageSettingsProps) {
  const { t } = useTranslation()
  const settings = getImageSettings(props.config)
  const flexible = supportsFlexibleImageSizes(props.config.model)
  const size = getImageSize(settings)
  const ratios = Object.keys(IMAGE_SIZE_PRESETS).filter(
    (ratio) => flexible || ['1:1', '3:2', '2:3'].includes(ratio)
  )
  const controls = [
    {
      key: 'ratio',
      label: t('Aspect ratio'),
      items: [
        { value: 'auto', label: t('Auto') },
        ...ratios.map((value) => ({ value, label: value })),
      ],
      disabled: false,
    },
    {
      key: 'resolution',
      label: t('Resolution'),
      items: ['1K', '2K', '4K'].map((value) => ({ value, label: value })),
      disabled: !flexible || settings.ratio === 'auto',
    },
    {
      key: 'quality',
      label: t('Image quality'),
      items: ['auto', 'low', 'medium', 'high'].map((value) => ({
        value,
        label: t(value),
      })),
      disabled: false,
    },
    {
      key: 'count',
      label: t('Image count'),
      items: Array.from({ length: 10 }, (_, index) => ({
        value: String(index + 1),
        label: t('{{count}} images', { count: index + 1 }),
      })),
      disabled: false,
    },
    {
      key: 'style',
      label: t('Style preset'),
      items: IMAGE_STYLES.map((style) => ({
        value: style.value,
        label: t(style.label),
      })),
      disabled: false,
    },
  ] as const

  return (
    <section
      aria-label={t('Image generation settings')}
      className='border-border/60 bg-muted/20 grid gap-3 border-b px-4 py-3'
    >
      <div className='flex flex-wrap items-center gap-2'>
        <ImageIcon aria-hidden='true' className='text-primary size-4' />
        <span className='text-sm font-medium'>{t('Image studio')}</span>
        <Badge variant='secondary' className='font-mono text-[10px]'>
          {size ? size.replace('x', ' × ') : t('Automatic size')}
        </Badge>
      </div>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'>
        {controls.map((control) => (
          <div className='grid min-w-0 gap-1.5' key={control.key}>
            <span className='text-muted-foreground text-xs'>
              {control.label}
            </span>
            <Select
              items={control.items}
              value={String(settings[control.key])}
              disabled={props.disabled || control.disabled}
              onValueChange={(value) => {
                if (
                  !value ||
                  !control.items.some((item) => item.value === value)
                ) {
                  return
                }
                props.onConfigChange('image', {
                  ...settings,
                  [control.key]:
                    control.key === 'count' ? Number(value) : value,
                })
              }}
            >
              <SelectTrigger
                aria-label={control.label}
                className='h-8 w-full min-w-0 text-xs'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {control.items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <p className='text-muted-foreground text-[11px] leading-5'>
        {t(
          'Each generation uses only your current prompt. Chat history and previous images are not sent.'
        )}{' '}
        {t(
          'More images, larger sizes and higher quality may increase cost and waiting time.'
        )}
        {settings.resolution === '4K' && (
          <>
            {' '}
            {t(
              '4K tier adapts to the aspect ratio; the exact requested dimensions are shown above.'
            )}
          </>
        )}
        {settings.style !== 'none' && (
          <>
            {' '}
            {t(
              'The selected style adds instructions to your prompt. The full prompt is saved with the result.'
            )}
          </>
        )}
      </p>
    </section>
  )
}
