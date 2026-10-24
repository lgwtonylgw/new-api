/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { ManualUSDTOrder } from '../../types'

interface ManualUSDTDialogProps {
  order: ManualUSDTOrder | null
  onOpenChange: (open: boolean) => void
}

export function ManualUSDTDialog(props: ManualUSDTDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={props.order !== null}
      onOpenChange={(open) => props.onOpenChange(open)}
    >
      <DialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Pay with USDT')}</DialogTitle>
          <DialogDescription>
            {t(
              'Send the exact USDT amount on the displayed network. Balance is credited after manual verification.'
            )}
          </DialogDescription>
        </DialogHeader>

        {props.order && (
          <div className='space-y-4'>
            <div className='flex justify-center rounded-lg border bg-white p-4'>
              <QRCodeSVG
                value={props.order.address ?? ''}
                size={224}
                level='M'
                title={t('Receiving address')}
              />
            </div>

            <div className='space-y-3 rounded-lg border p-4 text-sm'>
              <p>
                {t('Network')}: <strong>{props.order.network}</strong>
              </p>
              <p className='text-muted-foreground'>
                {t(
                  'Only send USDT on this network. Transfers on other networks cannot be credited.'
                )}
              </p>
              <div className='flex items-center gap-2'>
                <code className='min-w-0 break-all'>{props.order.address}</code>
                <CopyButton value={props.order.address ?? ''} />
              </div>
            </div>
            <div className='space-y-3 rounded-lg border p-4 text-sm'>
              <div className='flex items-center justify-between gap-3'>
                <span className='text-muted-foreground'>{t('You Pay')}</span>
                <span className='text-lg font-semibold'>
                  {props.order.money} USDT
                </span>
              </div>
              <div className='flex items-center justify-between gap-3'>
                <span className='text-muted-foreground'>
                  {t('Order number')}
                </span>
                <div className='flex min-w-0 items-center gap-1'>
                  <code className='truncate text-xs'>
                    {props.order.trade_no}
                  </code>
                  <CopyButton value={props.order.trade_no} />
                </div>
              </div>
            </div>

            <p className='text-muted-foreground text-xs'>
              {t(
                'Do not close the payment as completed yourself. Keep your receipt and wait for manual verification.'
              )}
            </p>
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button type='button'>{t('Done')}</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
