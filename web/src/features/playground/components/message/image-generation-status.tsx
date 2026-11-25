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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Loader } from '@/components/ai-elements/loader'

export function ImageGenerationStatus(props: { startedAt?: number }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const seconds = Math.max(
    0,
    Math.floor((now - (props.startedAt ?? now)) / 1000)
  )
  return (
    <div className='bg-muted/30 my-2 grid max-w-lg gap-2 rounded-xl border p-4'>
      <div className='flex items-center gap-2 text-sm' role='status'>
        <Loader />
        <span>{t('Generating images...')}</span>
        <span
          aria-hidden='true'
          className='text-muted-foreground ml-auto font-mono text-xs'
        >
          {t('{{value}}s', { value: seconds })}
        </span>
      </div>
      <p className='text-muted-foreground text-xs leading-5'>
        {seconds >= 120
          ? t(
              'Still waiting for the image service. You can keep waiting or stop this request.'
            )
          : t(
              'High resolution images can take several minutes. Keep this page open while generating.'
            )}
      </p>
      <p className='text-muted-foreground text-[11px] leading-5'>
        {t(
          'Stopping the wait does not guarantee cancellation or a refund from the image service.'
        )}
      </p>
    </div>
  )
}
