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
import { ImageIcon, VideoIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

type MediaLogUsageProps =
  | { count: number; tier: string }
  | { seconds: number; resolution: string; preConsumed: boolean }

export function MediaLogUsage(props: MediaLogUsageProps) {
  const { t, i18n } = useTranslation()
  const video = 'seconds' in props
  const Icon = video ? VideoIcon : ImageIcon
  const usage = video
    ? t('{{value}}s', {
        value: formatNumber(props.seconds, toIntlLocale(i18n.language)),
      })
    : t('{{count}} images', { count: props.count })

  return (
    <span className='inline-flex max-w-full min-w-0 items-start gap-1.5 text-xs leading-4'>
      <Icon aria-hidden='true' className='text-primary size-4 shrink-0' />
      <span className='min-w-0 [overflow-wrap:anywhere]'>
        <span className='font-medium tabular-nums'>{usage}</span>
        {video && (
          <>
            <span className='text-muted-foreground'> / {props.resolution}</span>
            {props.preConsumed && (
              <span className='text-muted-foreground'>
                {' '}
                ({t('Pre-consumed')})
              </span>
            )}
          </>
        )}
        {!video && props.tier && (
          <span className='text-muted-foreground'> ({props.tier})</span>
        )}
      </span>
    </span>
  )
}
