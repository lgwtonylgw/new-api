import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'

import { defaultBillingSettings } from '../../billing/default-settings'
import { getBillingSectionContent } from '../../billing/section-registry'
import { SettingsPageProvider } from '../../components/settings-page-context'

describe('Independent payment gateway settings', () => {
  it('shows persisted epusdt settings without replacing AliMPay credentials', async () => {
    const i18n = createInstance()
    await i18n.init({
      lng: 'en',
      resources: { en: { translation: {} } },
      interpolation: { escapeValue: false },
    })
    const settings = {
      ...defaultBillingSettings,
      PayAddress: 'https://alipay.example.com',
      EpayId: 'alipay-merchant',
      'payment_setting.epusdt_enabled': true,
      'payment_setting.epusdt_pay_address':
        'https://usdt.example.com/payments/epay/v1/order/create-transaction',
      'payment_setting.epusdt_merchant_id': '1000',
      'payment_setting.epusdt_secret_configured': true,
      'payment_setting.alipay_manual_enabled': true,
      'payment_setting.alipay_qr_code_url': 'https://example.com/old-qr.png',
    }

    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
          <SettingsPageProvider actionsContainer={null}>
            {getBillingSectionContent('payment', settings)}
          </SettingsPageProvider>
        </QueryClientProvider>
      </I18nextProvider>
    )

    fireEvent.click(screen.getByRole('tab', { name: 'epusdt' }))
    expect(
      screen.getByRole('textbox', { name: 'epusdt EPay endpoint' })
    ).toHaveValue(
      'https://usdt.example.com/payments/epay/v1/order/create-transaction'
    )
    expect(
      screen.getByRole('textbox', { name: 'epusdt merchant PID' })
    ).toHaveValue('1000')
    expect(
      screen.getByText(
        'Secret configured. Leave blank to keep the current key.'
      )
    ).toBeVisible()

    fireEvent.click(screen.getByRole('tab', { name: 'Epay' }))
    expect(screen.queryByRole('tab', { name: 'Alipay QR' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'USDT' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Epay endpoint' })).toHaveValue(
      'https://alipay.example.com'
    )
    expect(
      screen.getByRole('textbox', { name: 'Epay merchant ID' })
    ).toHaveValue('alipay-merchant')
  })
})
