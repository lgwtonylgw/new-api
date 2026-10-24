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
import { formatLocalCurrencyAmount } from '@/lib/currency'

import type { ManualAlipayOrder } from '../../types'

interface ManualAlipayDialogProps {
  order: ManualAlipayOrder | null
  onOpenChange: (open: boolean) => void
}

export function ManualAlipayDialog(props: ManualAlipayDialogProps) {
  const { t } = useTranslation()
  const isUSDT = props.order?.payment_method === 'usdt_manual'

  return (
    <Dialog
      open={props.order !== null}
      onOpenChange={(open) => props.onOpenChange(open)}
    >
      <DialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {isUSDT ? t('Pay with USDT') : t('Pay with Alipay')}
          </DialogTitle>
          <DialogDescription>
            {t(
              isUSDT
                ? 'Send the exact USDT amount on the displayed network. Balance is credited after manual verification.'
                : 'Scan the QR code and pay the exact amount. Balance is credited after an administrator verifies the receipt.'
            )}
          </DialogDescription>
        </DialogHeader>

        {props.order && (
          <div className='space-y-4'>
            <div className='flex justify-center rounded-lg border bg-white p-4'>
              {isUSDT ? (
                <QRCodeSVG
                  value={props.order.address ?? ''}
                  size={224}
                  level='M'
                  title={t('Receiving address')}
                />
              ) : (
                <img
                  src={props.order.qr_code_url}
                  alt={t('Alipay collection QR code')}
                  className='h-56 w-56 object-contain'
                  referrerPolicy='no-referrer'
                />
              )}
            </div>

            {isUSDT && (
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
                  <code className='min-w-0 break-all'>
                    {props.order.address}
                  </code>
                  <CopyButton value={props.order.address ?? ''} />
                </div>
              </div>
            )}
            <div className='space-y-3 rounded-lg border p-4 text-sm'>
              <div className='flex items-center justify-between gap-3'>
                <span className='text-muted-foreground'>{t('You Pay')}</span>
                <span className='text-lg font-semibold'>
                  {isUSDT
                    ? `${props.order.money} USDT`
                    : formatLocalCurrencyAmount(props.order.money, {
                        digitsLarge: 2,
                        digitsSmall: 2,
                        abbreviate: false,
                      })}
                </span>
              </div>
              {props.order.payee_name && (
                <div className='flex items-center justify-between gap-3'>
                  <span className='text-muted-foreground'>{t('Payee')}</span>
                  <span>{props.order.payee_name}</span>
                </div>
              )}
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
