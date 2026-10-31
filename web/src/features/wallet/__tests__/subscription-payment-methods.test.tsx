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
import { fireEvent, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import type { ComponentProps } from 'react'
import { I18nextProvider } from 'react-i18next'
import { expect, it, vi } from 'vitest'

import * as subscriptionApi from '@/features/subscriptions/api'
import type { SubscriptionPurchaseDialog } from '@/features/subscriptions/components/dialogs/subscription-purchase-dialog'
import { subscriptionPlanSchema } from '@/features/subscriptions/types'

import { SubscriptionPlansCard } from '../components/subscription-plans-card'
import type { PaymentMethod } from '../types'

vi.mock(
  '@/features/subscriptions/components/dialogs/subscription-purchase-dialog',
  () => ({
    SubscriptionPurchaseDialog: (
      props: ComponentProps<typeof SubscriptionPurchaseDialog>
    ) =>
      props.open ? (
        <div role='dialog'>
          {props.epayMethods?.map((method) => (
            <button type='button' key={method.type}>
              {method.name}
            </button>
          ))}
        </div>
      ) : null,
  })
)

it.each([false, true])(
  'excludes epusdt from subscription checkout with Alipay enabled=%s',
  async (includeAlipay) => {
    const i18n = createInstance()
    await i18n.init({ lng: 'en', resources: { en: { translation: {} } } })
    const plan = subscriptionPlanSchema.parse({
      id: 1,
      title: 'Monthly plan',
      price_amount: 10,
      duration_unit: 'month',
      duration_value: 1,
      quota_reset_period: 'never',
      enabled: true,
      sort_order: 0,
      max_purchase_per_user: 0,
      total_amount: 0,
    })
    vi.spyOn(subscriptionApi, 'getPublicPlans').mockResolvedValue({
      success: true,
      data: [{ plan }],
    })
    vi.spyOn(subscriptionApi, 'getSelfSubscriptionFull').mockResolvedValue({
      success: true,
      data: {
        billing_preference: 'wallet_first',
        subscriptions: [],
        all_subscriptions: [],
      },
    })
    const methods: PaymentMethod[] = [{ name: 'USDT-TRC20', type: 'usdt.tron' }]
    if (includeAlipay) methods.push({ name: 'Alipay', type: 'alipay' })

    render(
      <I18nextProvider i18n={i18n}>
        <SubscriptionPlansCard
          topupInfo={{
            enable_online_topup: true,
            enable_stripe_topup: false,
            pay_methods: methods,
            min_topup: 1,
            stripe_min_topup: 1,
            amount_options: [],
            discount: {},
          }}
        />
      </I18nextProvider>
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Subscribe Now' })
    )
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'USDT-TRC20' })).toBeNull()
    expect(Boolean(screen.queryByRole('button', { name: 'Alipay' }))).toBe(
      includeAlipay
    )
  }
)
