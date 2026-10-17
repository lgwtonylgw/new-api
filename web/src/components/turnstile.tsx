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
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

interface TurnstileProps {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  className?: string
}

export function Turnstile({
  siteKey,
  onVerify,
  onExpire,
  className,
}: TurnstileProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const verified = useEffectEvent((token: string) => onVerify(token))
  const expired = useEffectEvent(() => onExpire?.())

  useEffect(() => {
    let disposed = false
    let widgetId: string | undefined
    const fail = () => {
      if (disposed) return
      expired()
      setFailed(true)
    }
    const render = () => {
      if (
        disposed ||
        widgetId !== undefined ||
        !ref.current ||
        !window.turnstile
      ) {
        return
      }
      try {
        widgetId = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          // Run verification in the background for normal visitors. Cloudflare
          // only reveals the widget when its risk check requires interaction.
          appearance: 'interaction-only',
          retry: 'auto',
          'refresh-expired': 'auto',
          size:
            ref.current.clientWidth > 0 && ref.current.clientWidth < 300
              ? 'compact'
              : 'flexible',
          callback: (token: string) => {
            if (!disposed) verified(token)
          },
          'error-callback': fail,
          'expired-callback': () => {
            if (!disposed) expired()
          },
        })
      } catch {
        fail()
      }
    }

    const scriptId = 'cf-turnstile'
    let script = document.querySelector<HTMLScriptElement>(`#${scriptId}`)
    const scriptFailed = () => {
      script?.remove()
      fail()
    }
    if (window.turnstile) {
      render()
    } else {
      const created = !script
      if (!script) {
        script = document.createElement('script')
        script.id = scriptId
        script.src =
          'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        script.defer = true
      }
      script.addEventListener('load', render)
      script.addEventListener('error', scriptFailed)
      if (created) document.head.appendChild(script)
    }
    return () => {
      disposed = true
      script?.removeEventListener('load', render)
      script?.removeEventListener('error', scriptFailed)
      if (widgetId !== undefined) window.turnstile?.remove(widgetId)
    }
  }, [siteKey, attempt])

  return (
    <div className={className || 'w-full max-w-[300px]'}>
      <div ref={ref} />
      {failed && (
        <div
          role='alert'
          className='text-muted-foreground space-y-2 text-center text-xs'
        >
          <p>{t('Human verification could not load. Please try again.')}</p>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => {
              setFailed(false)
              setAttempt((current) => current + 1)
            }}
          >
            {t('Retry')}
          </Button>
        </div>
      )}
    </div>
  )
}
