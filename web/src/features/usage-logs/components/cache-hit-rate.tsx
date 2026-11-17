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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

import { formatCacheHitRate } from '../lib/format'

export function CacheHitRate(props: {
  promptTokens: number
  cacheReadTokens: number
  cacheWriteTokens?: number
  isClaude?: boolean
  inputTokensTotal?: number
}) {
  const { t } = useTranslation()
  const inferredTotalInput = props.isClaude
    ? props.promptTokens + props.cacheReadTokens + (props.cacheWriteTokens ?? 0)
    : props.promptTokens
  const totalInputTokens =
    props.inputTokensTotal && props.inputTokensTotal > 0
      ? props.inputTokensTotal
      : inferredTotalInput
  const rate = formatCacheHitRate(totalInputTokens, props.cacheReadTokens)
  if (!rate) return null

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        aria-label={`${t('Input cache hit rate')}: ${rate}`}
        render={
          <Button
            variant='ghost'
            className='text-muted-foreground h-auto rounded-sm px-0.5 py-0 text-[length:inherit] font-normal tabular-nums'
          />
        }
      >
        {t('Hit {{rate}}', { rate })}
      </PopoverTrigger>
      <PopoverContent side='top' className='gap-2 text-xs'>
        <PopoverTitle>{t('Input cache hit rate')}</PopoverTitle>
        <p>
          {t(
            'Cached input tokens divided by total input tokens for this request.'
          )}
        </p>
        <p className='text-muted-foreground'>
          {t(
            'Cache hit rate is not the percentage of cost saved. Charges depend on the model cache pricing.'
          )}
        </p>
      </PopoverContent>
    </Popover>
  )
}
