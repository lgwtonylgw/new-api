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

export function BilledImageUsage(props: { count: number; tier: string }) {
  const { t } = useTranslation()
  return (
    <span className='inline-flex min-w-0 max-w-full items-start gap-1.5 text-xs leading-4'>
      <ImageIcon aria-hidden='true' className='text-primary size-4 shrink-0' />
      <span className='min-w-0 [overflow-wrap:anywhere]'>
        <span className='font-medium tabular-nums'>
          {t('{{count}} images', { count: props.count })}
        </span>
        {props.tier && (
          <span className='text-muted-foreground'> ({props.tier})</span>
        )}
      </span>
    </span>
  )
}
