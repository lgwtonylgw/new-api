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
import { act, render, screen, fireEvent } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, expect, it, vi } from 'vitest'

import { BillingHistoryDialog } from '@/features/wallet/components/dialogs/billing-history-dialog'
import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'

import { ManualUSDTDialog } from '../components/dialogs/manual-usdt-dialog'
import { PaymentConfirmDialog } from '../components/dialogs/payment-confirm-dialog'
import { RechargeFormCard } from '../components/recharge-form-card'
import { requestPaymentAmount } from '../hooks/use-payment'

const i18n = createInstance()

beforeEach(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'zh',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en, zh },
    interpolation: { escapeValue: false },
  })
})

it('translates billing history statuses and updates them when the language changes', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        total: 3,
        items: ['success', 'pending', 'expired'].map((status, id) => ({
          id,
          status,
          amount: 10,
          money: 10,
          trade_no: `order-${id}`,
          payment_method: 'stripe',
          create_time: 1,
        })),
      },
    },
  })
  render(
    <I18nextProvider i18n={i18n}>
      <BillingHistoryDialog open onOpenChange={vi.fn()} />
    </I18nextProvider>
  )
  await screen.findByText('order-0')
  for (const label of ['成功', '待确认', '已过期']) {
    expect(screen.getByText(label)).toBeVisible()
  }
  await act(() => i18n.changeLanguage('en'))
  for (const label of ['Success', 'Pending', 'Expired']) {
    expect(screen.getByText(label)).toBeVisible()
  }
})

it.each([
  { priceRatio: 7.3, paid: '584', saved: '146', full: '146' },
  { priceRatio: 0.000123, paid: '0.0098', saved: '0.0025', full: '0.0025' },
])(
  'translates recharge presets and minimum amount without changing precision at price ratio $priceRatio',
  async ({ priceRatio, paid, saved, full }) => {
    render(
      <I18nextProvider i18n={i18n}>
        <RechargeFormCard
          topupInfo={{
            enable_online_topup: true,
            enable_stripe_topup: false,
            pay_methods: [],
            min_topup: 1,
            stripe_min_topup: 1,
            amount_options: [100, 20],
            discount: {},
          }}
          presetAmounts={[{ value: 100, discount: 0.8 }, { value: 20 }]}
          selectedPreset={null}
          topupAmount={1}
          paymentAmount={priceRatio}
          priceRatio={priceRatio}
          calculating={false}
          paymentLoading={null}
          redemptionCode=''
          redeeming={false}
          onSelectPreset={vi.fn()}
          onTopupAmountChange={vi.fn()}
          onPaymentMethodSelect={vi.fn()}
          onRedemptionCodeChange={vi.fn()}
          onRedeem={vi.fn()}
        />
      </I18nextProvider>
    )
    expect(screen.getByRole('button', { name: /^100 / })).toHaveTextContent(
      `优惠 20%支付 ${paid} • 节省 ${saved}`
    )
    expect(screen.getByRole('button', { name: /^20 / })).toHaveTextContent(
      `支付 ${full}`
    )
    expect(screen.getByPlaceholderText('最低 1')).toBeVisible()
    await act(() => i18n.changeLanguage('en'))
    expect(screen.getByRole('button', { name: /^100 / })).toHaveTextContent(
      `20% OFFPay ${paid} • Save ${saved}`
    )
    expect(screen.getByRole('button', { name: /^20 / })).toHaveTextContent(
      `Pay ${full}`
    )
    expect(screen.getByPlaceholderText('Minimum 1')).toBeVisible()
  }
)

it('shows the USDT network, receiving address and exact amount without treating a close as payment completion', async () => {
  const onOpenChange = vi.fn()
  render(
    <I18nextProvider i18n={i18n}>
      <ManualUSDTDialog
        order={{
          trade_no: 'USDT-test-order',
          money: 1.369864,
          payment_method: 'usdt_manual',
          network: 'TRC20',
          address: 'TT1FCWG4PKGzDXE17LQBRWASiTFiQVTFwp',
        }}
        onOpenChange={onOpenChange}
      />
    </I18nextProvider>
  )
  expect(await screen.findByRole('dialog')).toBeVisible()
  expect(screen.getByText('1.369864 USDT')).toBeVisible()
  expect(screen.getByText('TRC20')).toBeVisible()
  expect(screen.getByText('TT1FCWG4PKGzDXE17LQBRWASiTFiQVTFwp')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '完成' }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

it('displays a USDT quote in the payment confirmation and prevents confirming while it is loading', async () => {
  const onConfirm = vi.fn()
  const view = render(
    <I18nextProvider i18n={i18n}>
      <PaymentConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        topupAmount={10}
        paymentAmount={1.369864}
        paymentMethod={{ name: 'USDT', type: 'usdt_manual' }}
        calculating={false}
        processing={false}
      />
    </I18nextProvider>
  )
  expect(await screen.findByText('1.369864 USDT')).toBeVisible()
  view.rerender(
    <I18nextProvider i18n={i18n}>
      <PaymentConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        topupAmount={10}
        paymentAmount={1.369864}
        paymentMethod={{ name: 'USDT', type: 'usdt_manual' }}
        calculating
        processing={false}
      />
    </I18nextProvider>
  )
  const confirm = screen.getByRole('button', {
    name: i18n.t('Confirm Payment'),
  })
  expect(confirm).toBeDisabled()
  fireEvent.click(confirm)
  expect(onConfirm).not.toHaveBeenCalled()
})

it('requests a regular fiat quote for gateway payments', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { message: 'success', data: '1.369864' } })
  expect(await requestPaymentAmount(10, 'alipay')).toBe(1.369864)
  expect(post).toHaveBeenCalledWith(
    '/api/user/amount',
    { amount: 10 },
    expect.any(Object)
  )
})
