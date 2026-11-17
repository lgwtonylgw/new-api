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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import type { ComponentProps } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { PerformanceSection } from '../performance-section'

vi.mock('@/lib/handle-server-error', () => ({ handleServerError: vi.fn() }))

const defaults: ComponentProps<typeof PerformanceSection>['defaultValues'] = {
  'performance_setting.disk_cache_enabled': false,
  'performance_setting.disk_cache_threshold_mb': 10,
  'performance_setting.disk_cache_max_size_mb': 1024,
  'performance_setting.disk_cache_path': '',
  'performance_setting.monitor_enabled': false,
  'performance_setting.monitor_cpu_threshold': 90,
  'performance_setting.monitor_memory_threshold': 90,
  'performance_setting.monitor_disk_threshold': 95,
  'performance_setting.monitor_alert_enabled': false,
  'performance_setting.monitor_telegram_bot_token':
    '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789',
  'performance_setting.monitor_telegram_chat_id': '-1001234567890',
}

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
})

afterEach(() => vi.restoreAllMocks())

async function renderSettings() {
  const i18n = createInstance()
  await i18n.init({ lng: 'en', resources: { en: { translation: {} } } })
  const queryClient = new QueryClient()
  const container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SettingsPageProvider actionsContainer={container}>
          <PerformanceSection defaultValues={defaults} />
        </SettingsPageProvider>
      </QueryClientProvider>
    </I18nextProvider>,
    { container }
  )
}

it('saves the dedicated Telegram credentials together with the alert switch', async () => {
  const put = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  const user = userEvent.setup()
  await renderSettings()
  expect(screen.getByLabelText('Telegram Bot Token')).toHaveAttribute(
    'type',
    'password'
  )
  await user.click(
    screen.getByRole('switch', { name: 'Enable Telegram Alerts' })
  )
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() =>
    expect(put).toHaveBeenCalledWith(
      '/api/option/performance',
      expect.objectContaining({
        monitor_alert_enabled: true,
        monitor_telegram_bot_token:
          defaults['performance_setting.monitor_telegram_bot_token'],
        monitor_telegram_chat_id:
          defaults['performance_setting.monitor_telegram_chat_id'],
      })
    )
  )
})

it('sends a test message using the current form credentials', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  const user = userEvent.setup()
  await renderSettings()
  await user.clear(screen.getByLabelText('Telegram Chat ID'))
  await user.type(screen.getByLabelText('Telegram Chat ID'), '@gate_alerts')
  await user.click(screen.getByRole('button', { name: 'Send Test Alert' }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/system-info/alerts/test', {
      bot_token: defaults['performance_setting.monitor_telegram_bot_token'],
      chat_id: '@gate_alerts',
    })
  )
})

it('presents Telegram test failures and allows retrying', async () => {
  const error = new Error('Telegram unavailable')
  vi.spyOn(api, 'post').mockRejectedValue(error)
  const user = userEvent.setup()
  await renderSettings()
  await user.click(screen.getByRole('button', { name: 'Send Test Alert' }))
  await waitFor(() =>
    expect(handleServerError).toHaveBeenCalledWith(error, 'Test alert failed')
  )
  expect(screen.getByRole('button', { name: 'Send Test Alert' })).toBeEnabled()
})
