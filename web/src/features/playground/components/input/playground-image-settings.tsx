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
import { SlidersHorizontalIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  DEFAULT_IMAGE_SETTINGS,
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
    <section aria-label={t('Image generation settings')} className='grid gap-3'>
      <div className='grid grid-cols-2 gap-x-3 gap-y-2.5'>
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
      <div className='flex flex-wrap items-center justify-between gap-1 border-t pt-2'>
        <span className='text-muted-foreground text-xs tabular-nums'>
          {size ? size.replace('x', ' × ') : t('Automatic size')}
        </span>
        <Button
          size='sm'
          variant='ghost'
          type='button'
          disabled={props.disabled}
          onClick={() => props.onConfigChange('image', DEFAULT_IMAGE_SETTINGS)}
        >
          {t('Reset to default')}
        </Button>
      </div>
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {t(
          'More images, larger sizes and higher quality may increase cost and waiting time.'
        )}
      </p>
    </section>
  )
}

export function PlaygroundImageSettingsPopover(
  props: PlaygroundImageSettingsProps
) {
  const { t } = useTranslation()
  const { ratio, count } = getImageSettings(props.config)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <PromptInputButton
            aria-label={t('Image generation settings')}
            className='bg-muted/60 hover:bg-muted gap-1.5 rounded-lg px-2'
            disabled={props.disabled}
            size='sm'
          />
        }
      >
        <SlidersHorizontalIcon />
        <span className='text-xs tabular-nums'>
          {ratio === 'auto' ? t('Auto') : ratio} ·{' '}
          {t('{{count}} images', { count })}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side='top'
        align='start'
        sideOffset={8}
        collisionPadding={8}
        className='max-h-(--available-height) w-80 max-w-[calc(100vw-1rem)] gap-3 overflow-y-auto rounded-xl p-3.5'
      >
        <PopoverTitle>{t('Image generation settings')}</PopoverTitle>
        <PlaygroundImageSettings {...props} />
      </PopoverContent>
    </Popover>
  )
}
