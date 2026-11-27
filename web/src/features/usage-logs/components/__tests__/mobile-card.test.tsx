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
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { usageLogSchema, type UsageLog } from '../../data/schema'
import { useCommonLogsColumns } from '../columns/common-logs-columns'
import { UsageLogsMobileList } from '../usage-logs-mobile-card'
import { UsageLogsProvider, useUsageLogsContext } from '../usage-logs-provider'

const longName = 'enterprise-production-failover-2026-without-any-short-alias'
const log = usageLogSchema.parse({
  id: 1,
  user_id: 2,
  created_at: 1788840000,
  type: 2,
  content: '',
  model_name: longName,
  username: 'production-admin',
  channel: 372,
  channel_name: longName,
  token_name: 'backend-production-token',
  group: 'enterprise-production',
  quota: 123456789,
  use_time: 1.5,
  prompt_tokens: 1200,
  completion_tokens: 800,
  other: JSON.stringify({
    cache_tokens: 300,
    cache_creation_tokens_5m: 200,
    model_ratio: 1,
  }),
})

function Fixture(props: {
  admin?: boolean
  visibility?: VisibilityState
  logs?: UsageLog[]
  loading?: boolean
  desktopTokens?: boolean
}) {
  const columns = useCommonLogsColumns(props.admin ?? true, false)
  const context = useUsageLogsContext()
  const table = useReactTable({
    data: props.logs ?? [log],
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: { columnVisibility: props.visibility ?? {} },
  })
  if (props.desktopTokens) {
    return table.getRowModel().rows.map((row) => {
      const cell = row
        .getAllCells()
        .find((item) => item.column.id === 'prompt_tokens')
      if (!cell) throw new Error('The log must have a tokens column')
      return (
        <div key={row.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      )
    })
  }
  return (
    <>
      <button type='button' onClick={() => context.setSensitiveVisible(false)}>
        Hide sensitive data
      </button>
      <UsageLogsMobileList
        table={table}
        logCategory='common'
        isLoading={props.loading}
      />
    </>
  )
}

function renderLogs(props: Parameters<typeof Fixture>[0] = {}) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <UsageLogsProvider>
        <Fixture {...props} />
      </UsageLogsProvider>
    </QueryClientProvider>
  )
}

it('shows model mismatch evidence when tapping the mobile model badge', async () => {
  const user = userEvent.setup()
  renderLogs({
    logs: [
      {
        ...log,
        other: JSON.stringify({
          response_model: {
            requested_model: longName,
            upstream_model: 'mapped-model',
            returned_model: 'unexpected-model',
          },
        }),
      },
    ],
  })
  await user.click(
    screen.getByRole('button', {
      name: `Model: ${longName}, Response model: unexpected-model`,
    })
  )
  const dialog = await screen.findByRole('dialog', { name: 'Model' })
  expect(
    within(dialog).getByText('Response model: unexpected-model')
  ).toBeVisible()
  expect(within(dialog).getByText('mapped-model')).toBeVisible()
  expect(within(dialog).getByText('unexpected-model')).toBeVisible()
})

it('opens long channel text on tap and copies the complete value', async () => {
  const user = userEvent.setup()
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  renderLogs()
  await user.click(
    screen.getByRole('button', { name: `Channel: ${longName} #372` })
  )
  const dialog = await screen.findByRole('dialog', { name: 'Channel' })
  expect(within(dialog).getByText(`${longName} #372`)).toHaveClass(
    '[overflow-wrap:anywhere]'
  )
  await user.click(
    within(dialog).getByRole('button', { name: 'Copy to clipboard' })
  )
  expect(copy).toHaveBeenCalledWith(`${longName} #372`)
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(
    screen.getByRole('button', { name: `Channel: ${longName} #372` })
  ).toHaveFocus()
})

it.each([false, true])(
  'copies the full mobile model name with the keyboard without opening details when there is no mapping or difference (response observed: %s)',
  async (observed) => {
    const user = userEvent.setup()
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderLogs({
      logs: [
        {
          ...log,
          other: observed
            ? JSON.stringify({
                response_model: {
                  requested_model: longName,
                  upstream_model: longName,
                  returned_model: longName,
                },
              })
            : log.other,
        },
      ],
    })
    const button = screen.getByRole('button', { name: `Model: ${longName}` })
    const modelText = within(button).getByText(longName)
    expect(modelText).toHaveClass(
      'line-clamp-2',
      'leading-5',
      '[overflow-wrap:anywhere]'
    )
    expect(modelText.closest('[data-slot="status-badge"]')).toHaveClass(
      'max-w-full',
      'min-h-6',
      'py-px'
    )
    button.focus()
    await user.keyboard('{Enter}')
    expect(copy).toHaveBeenCalledWith(longName)
    expect(
      screen.queryByRole('dialog', { name: 'Model' })
    ).not.toBeInTheDocument()
  }
)

it('hides sensitive names and disables full-text inspection when privacy is enabled', async () => {
  const user = userEvent.setup()
  renderLogs()
  await user.click(screen.getByRole('button', { name: 'Hide sensitive data' }))
  expect(screen.queryByText('production-admin')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /Channel:/ })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /Token:/ })
  ).not.toBeInTheDocument()
})

it('respects hidden columns and omits admin fields in the self view', () => {
  renderLogs({
    admin: false,
    visibility: { token_name: false, model_name: false },
  })
  expect(
    screen.queryByRole('button', {
      name: /Channel:|User:|Token:|Group:|Model:/,
    })
  ).not.toBeInTheDocument()
  expect(screen.queryByText('enterprise-production')).not.toBeInTheDocument()
})

it('keeps input, output and cache quantities readable without empty metric cells', () => {
  renderLogs()
  expect(screen.getByText('Input')).toBeVisible()
  expect(screen.getByText('Output')).toBeVisible()
  expect(screen.getByText(/300/)).toBeVisible()
  expect(screen.getByText('Cache ↑ 200')).toBeVisible()
})

it('shows the established empty state when no logs exist', () => {
  renderLogs({ logs: [] })
  expect(screen.getByText('No Logs Found')).toBeVisible()
})

it.each([false, true])(
  'keeps timing in the right column for streaming=%s',
  (streaming) => {
    renderLogs({
      logs: [
        {
          ...log,
          is_stream: streaming,
          use_time: 58,
          other: JSON.stringify({ frt: 58000 }),
        },
      ],
    })
    const row = screen
      .getByRole('button', { name: /^Time:/ })
      .closest('[data-slot="log-time-and-timing"]')
    expect(row).toHaveClass('grid', 'grid-cols-2')
    expect(
      screen.getByRole('button', { name: /^Time:/ }).parentElement
    ).toHaveClass('flex-col', 'justify-between')
    expect(
      within(row as HTMLElement)
        .getByText('Duration')
        .closest('.col-start-2')
    ).not.toBeNull()
    if (streaming) {
      expect(within(row as HTMLElement).getByText('First token')).toBeVisible()
    }
  }
)

it('retains the user avatar and model badge in the mobile summary', () => {
  renderLogs()
  expect(screen.getByText('P')).toBeVisible()
  const modelButton = screen.getByRole('button', { name: `Model: ${longName}` })
  expect(modelButton.querySelector('[data-slot="status-badge"]')).not.toBeNull()
})

it('omits unused token and throughput placeholders for async jobs', () => {
  renderLogs({
    logs: [
      {
        ...log,
        prompt_tokens: 0,
        completion_tokens: 0,
        other: JSON.stringify({ is_task: true }),
      },
    ],
  })
  expect(screen.getByText('Async')).toBeVisible()
  expect(screen.queryByText('Input')).not.toBeInTheDocument()
  const timing = screen
    .getByRole('button', { name: /^Time:/ })
    .closest('[data-slot="log-time-and-timing"]')
  expect(within(timing as HTMLElement).queryByText('—')).not.toBeInTheDocument()
})

it('labels a task whose result was returned in the response as synchronous', () => {
  renderLogs({
    logs: [
      {
        ...log,
        prompt_tokens: 0,
        completion_tokens: 0,
        other: JSON.stringify({ is_task: true, task_sync: true }),
      },
    ],
  })
  expect(screen.getByText('Sync')).toBeVisible()
  expect(screen.queryByText('Async')).not.toBeInTheDocument()
})

it('shows mapped model names in full when inspecting a mobile model badge', async () => {
  const user = userEvent.setup()
  renderLogs({
    logs: [
      {
        ...log,
        other: JSON.stringify({
          is_model_mapped: true,
          upstream_model_name:
            'provider-production-mapped-model-with-a-long-name',
        }),
      },
    ],
  })
  await user.click(screen.getByRole('button', { name: `Model: ${longName}` }))
  const dialog = await screen.findByRole('dialog', { name: 'Model' })
  expect(within(dialog).getByText('Actual Model')).toBeVisible()
  expect(
    within(dialog).getByText(
      'provider-production-mapped-model-with-a-long-name'
    )
  ).toBeVisible()
})

it('shows loading placeholders without displaying stale log fields', () => {
  renderLogs({ loading: true })
  expect(screen.getByRole('status', { name: 'Loading' })).toHaveAttribute(
    'aria-busy',
    'true'
  )
  expect(
    screen.queryByRole('button', { name: /^Model:/ })
  ).not.toBeInTheDocument()
})

it('explains the per-request cache rate when tapped', async () => {
  const user = userEvent.setup()
  renderLogs()
  const trigger = screen.getByRole('button', {
    name: 'Input cache hit rate: 25.0%',
  })
  expect(trigger).toHaveTextContent('Hit 25.0%')
  await user.click(trigger)
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('Input cache hit rate')).toBeVisible()
  expect(
    within(dialog).getByText(
      'Cached input tokens divided by total input tokens for this request.'
    )
  ).toBeVisible()
  expect(
    within(dialog).getByText(
      'Cache hit rate is not the percentage of cost saved. Charges depend on the model cache pricing.'
    )
  ).toBeVisible()
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  trigger.focus()
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('dialog')).toBeVisible()
})

it.each([false, true])(
  'distinguishes estimated and settled video usage (desktop: %s)',
  (desktopTokens) => {
    renderLogs({
      desktopTokens,
      logs: [
        {
          ...log,
          other: JSON.stringify({
            is_task: true,
            billing_mode: 'tiered_expr',
            matched_tier: '768P',
            usage_facts: { seconds: 7.5, resolution: '768P' },
            cache_tokens: 300,
          }),
        },
        ...([2, 6, 8] as const).map((type) => ({
          ...log,
          id: log.id + type,
          type,
          quota: type === 8 ? 0 : log.quota,
          other: JSON.stringify({
            task_id: 'task_test',
            actual_quota: 100,
            billing_mode: 'tiered_expr',
            usage_facts: { seconds: type, size: '1280x720' },
          }),
        })),
      ],
    })

    expect(screen.getByText('7.5s')).toBeVisible()
    expect(screen.getByText('/ 768P')).toBeVisible()
    expect(screen.getByText('(Estimated at submission)')).toBeVisible()
    expect(screen.getByText('2s')).toBeVisible()
    expect(screen.getByText('6s')).toBeVisible()
    expect(screen.getByText('8s')).toBeVisible()
    expect(screen.getAllByText('/ 1280x720')).toHaveLength(3)
    expect(screen.getAllByText('(Settled usage)')).toHaveLength(3)
    expect(screen.queryByText('1,200 / 800')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Input cache hit rate/ })
    ).not.toBeInTheDocument()
  }
)

it.each([false, true])(
  'shows billable image count and the recorded tier in the usage column (desktop: %s)',
  (desktopTokens) => {
    renderLogs({
      desktopTokens,
      logs: [
        {
          ...log,
          other: JSON.stringify({
            billing_unit: 'request',
            image_count: 2,
            matched_tier: '2K',
            cache_tokens: 300,
          }),
        },
      ],
    })

    expect(screen.getByText('2 images')).toBeVisible()
    expect(screen.getByText('(2K)')).toBeVisible()
    expect(screen.queryByText('1,200 / 800')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Input cache hit rate/ })
    ).not.toBeInTheDocument()
  }
)

it.each([false, true])(
  'shows fixed-tier image logs with count recorded in the log details (desktop: %s)',
  (desktopTokens) => {
    renderLogs({
      desktopTokens,
      logs: [
        {
          ...log,
          other: JSON.stringify({
            billing_mode: 'tiered_expr',
            billing_unit: 'request',
            matched_tier: '4K',
            content_parts: [
              { key: 'Image count {{count}}', params: { count: 2 } },
            ],
          }),
        },
      ],
    })

    expect(screen.getByText('2 images')).toBeVisible()
    expect(screen.getByText('(4K)')).toBeVisible()
  }
)

it.each([false, true])(
  'shows the quantity for older fixed-price image logs without a tier (desktop: %s)',
  (desktopTokens) => {
    renderLogs({
      desktopTokens,
      logs: [
        {
          ...log,
          prompt_tokens: 0,
          completion_tokens: 0,
          other: JSON.stringify({
            model_price: 0.12,
            content_parts: [
              { key: 'Size {{size}}', params: { size: '2880x2880' } },
              { key: 'Image count {{count}}', params: { count: 3 } },
            ],
          }),
        },
      ],
    })

    expect(screen.getByText('3 images')).toBeVisible()
    expect(screen.queryByText('(2K)')).not.toBeInTheDocument()
  }
)

it.each([false, true])(
  'keeps the token display for token-billed image requests (desktop: %s)',
  (desktopTokens) => {
    renderLogs({
      desktopTokens,
      logs: [
        {
          ...log,
          other: JSON.stringify({
            billing_unit: 'token',
            image_count: 2,
            matched_tier: '2K',
            cache_tokens: 300,
          }),
        },
      ],
    })

    expect(screen.queryByText('2 images')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Input cache hit rate: 25.0%' })
    ).toBeVisible()
  }
)

it.each([false, true])(
  'keeps the cache rate and cache token counts on one line (desktop: %s)',
  (desktopTokens) => {
    renderLogs({ desktopTokens })
    const rate = screen.getByRole('button', {
      name: 'Input cache hit rate: 25.0%',
    })
    const cacheRow = rate.closest('[data-slot="log-cache-tokens"]')
    expect(cacheRow).toHaveClass('flex-nowrap', 'whitespace-nowrap')
    expect(cacheRow).toHaveTextContent('300')
    expect(cacheRow).toHaveTextContent('200')
  }
)

it.each([0, 1201])(
  'hides an unavailable or inconsistent cache rate (%s)',
  (cacheTokens) => {
    renderLogs({
      logs: [{ ...log, other: JSON.stringify({ cache_tokens: cacheTokens }) }],
    })
    expect(
      screen.queryByRole('button', { name: /Input cache hit rate/ })
    ).not.toBeInTheDocument()
  }
)

it('uses total Claude input when calculating the cache hit rate', () => {
  renderLogs({
    logs: [
      {
        ...log,
        prompt_tokens: 100,
        other: JSON.stringify({
          claude: true,
          cache_tokens: 900,
          cache_write_tokens: 100,
        }),
      },
    ],
  })
  expect(
    screen.getByRole('button', { name: 'Input cache hit rate: 81.8%' })
  ).toBeVisible()
})
