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
import { useQuery } from '@tanstack/react-query'
import { Activity, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { createServerError } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getSystemMetricHistory, listSystemInstances } from '../api'
import type { SystemMetricRange } from '../types'

const RANGE_OPTIONS: Array<{ value: SystemMetricRange; label: string }> = [
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

export function SystemMetricsPanel() {
  const { t, i18n } = useTranslation()
  const [nodeName, setNodeName] = useState('')
  const [range, setRange] = useState<SystemMetricRange>('1h')

  const instancesQuery = useQuery({
    queryKey: ['system-info', 'instances'],
    queryFn: async () => {
      const res = await listSystemInstances()
      if (!res.success || !Array.isArray(res.data)) {
        throw createServerError(res, t('We could not load instances.'))
      }
      return res.data
    },
    staleTime: 30 * 1000,
    retry: false,
  })

  const instances = useMemo(
    () => instancesQuery.data ?? [],
    [instancesQuery.data]
  )
  useEffect(() => {
    if (nodeName && instances.some((item) => item.node_name === nodeName)) {
      return
    }
    setNodeName(instances[0]?.node_name ?? '')
  }, [instances, nodeName])

  const metricsQuery = useQuery({
    queryKey: ['system-info', 'metrics', nodeName, range],
    queryFn: async () => {
      const res = await getSystemMetricHistory(nodeName, range)
      if (!res.success || !res.data) {
        throw createServerError(res, t('We could not load resource metrics.'))
      }
      return res.data
    },
    enabled: nodeName.length > 0,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
  })

  const chartData = useMemo(
    () =>
      (metricsQuery.data?.samples ?? []).map((sample) => ({
        ...sample,
        cpu_usage: Number(sample.cpu_usage.toFixed(1)),
        memory_usage: Number(sample.memory_usage.toFixed(1)),
        storage_usage: Number(sample.storage_usage.toFixed(1)),
      })),
    [metricsQuery.data]
  )

  const chartConfig = useMemo<ChartConfig>(
    () => ({
      cpu_usage: { label: t('CPU'), color: 'var(--chart-1)' },
      memory_usage: { label: t('Memory'), color: 'var(--chart-2)' },
      storage_usage: { label: t('Storage'), color: 'var(--chart-3)' },
    }),
    [t]
  )

  const timeFormatter = useMemo(() => {
    const longRange = range === '7d' || range === '30d'
    return new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
      month: longRange ? 'short' : undefined,
      day: longRange ? 'numeric' : undefined,
      hour: longRange ? undefined : '2-digit',
      minute: longRange ? undefined : '2-digit',
    })
  }, [i18n.language, range])

  const detailTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.language]
  )

  const loading = instancesQuery.isLoading || metricsQuery.isLoading
  const error = instancesQuery.error ?? metricsQuery.error

  let content
  if (loading) {
    content = <Skeleton className='h-[320px] w-full rounded-md' />
  } else if (error) {
    content = (
      <ErrorState
        title={t('We could not load resource metrics.')}
        description={error instanceof Error ? error.message : undefined}
        onRetry={() => {
          void instancesQuery.refetch()
          void metricsQuery.refetch()
        }}
        className='min-h-[280px]'
      />
    )
  } else if (!nodeName || chartData.length === 0) {
    content = (
      <div className='text-muted-foreground flex h-[280px] items-center justify-center text-sm'>
        {t('No resource metric samples yet.')}
      </div>
    )
  } else {
    content = (
      <ChartContainer
        config={chartConfig}
        className='aspect-auto h-[320px] w-full'
        initialDimension={{ width: 960, height: 320 }}
      >
        <LineChart data={chartData} margin={{ left: 0, right: 12, top: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey='sampled_at'
            tickLine={false}
            axisLine={false}
            minTickGap={30}
            tickFormatter={(value: number) =>
              timeFormatter.format(new Date(value * 1000))
            }
          />
          <YAxis
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            width={34}
            tickFormatter={(value: number) => `${value}%`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const timestamp = payload?.[0]?.payload?.sampled_at
                  return typeof timestamp === 'number'
                    ? detailTimeFormatter.format(new Date(timestamp * 1000))
                    : ''
                }}
                formatter={(value, name, item) => (
                  <div className='flex min-w-36 items-center justify-between gap-4'>
                    <span className='text-muted-foreground'>
                      {chartConfig[String(name)]?.label ?? item.name}
                    </span>
                    <span className='font-mono font-medium'>{`${Number(value).toFixed(1)}%`}</span>
                  </div>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            dataKey='cpu_usage'
            type='monotone'
            stroke='var(--color-cpu_usage)'
            strokeWidth={2}
            dot={false}
          />
          <Line
            dataKey='memory_usage'
            type='monotone'
            stroke='var(--color-memory_usage)'
            strokeWidth={2}
            dot={false}
          />
          <Line
            dataKey='storage_usage'
            type='monotone'
            stroke='var(--color-storage_usage)'
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ChartContainer>
    )
  }

  return (
    <section className='bg-card overflow-hidden rounded-lg border shadow-xs'>
      <div className='flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='bg-muted text-muted-foreground inline-flex size-7 items-center justify-center rounded-md'>
            <Activity className='size-4' aria-hidden='true' />
          </span>
          <div className='min-w-0'>
            <h3 className='text-sm font-semibold'>{t('Resource Trends')}</h3>
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {t('CPU, memory, and storage are sampled once per minute.')}
            </p>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Select
            value={nodeName}
            onValueChange={(value) => setNodeName(value ?? '')}
          >
            <SelectTrigger size='sm' aria-label={t('Node')}>
              <SelectValue placeholder={t('Node')} />
            </SelectTrigger>
            <SelectContent>
              {instances.map((instance) => (
                <SelectItem key={instance.node_name} value={instance.node_name}>
                  {instance.node_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={range}
            onValueChange={(value) => {
              if (value) setRange(value as SystemMetricRange)
            }}
          >
            <SelectTrigger size='sm' aria-label={t('Time Range')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => void metricsQuery.refetch()}
            disabled={!nodeName || metricsQuery.isFetching}
          >
            <RefreshCw
              data-icon='inline-start'
              className={cn(
                'size-3.5',
                metricsQuery.isFetching && 'animate-spin'
              )}
              aria-hidden='true'
            />
            {t('Refresh')}
          </Button>
        </div>
      </div>
      <div className='p-4 sm:p-5' aria-busy={metricsQuery.isFetching}>
        {content}
      </div>
    </section>
  )
}
