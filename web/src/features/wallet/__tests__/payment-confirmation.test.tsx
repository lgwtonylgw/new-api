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
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { usePayment } from '../hooks/use-payment'
import { useTopupConfirmation } from '../hooks/use-topup-confirmation'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  sessionStorage.clear()
})

it('tracks the created payment order before submitting the checkout form', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      message: 'success',
      url: 'https://pay.example/submit',
      trade_no: 'order-123',
      data: { pid: 'merchant-1' },
    },
  })
  const submit = vi
    .spyOn(HTMLFormElement.prototype, 'submit')
    .mockImplementation(() => {})
  const onOrderCreated = vi.fn()
  const { result } = renderHook(() => usePayment(onOrderCreated))

  await act(async () => {
    expect(await result.current.processPayment(10, 'alipay')).toBe(true)
  })

  expect(onOrderCreated).toHaveBeenCalledExactlyOnceWith('order-123')
  expect(submit).toHaveBeenCalledOnce()
})

it('resumes monitoring after returning from checkout and refreshes only for this successful order', async () => {
  vi.useFakeTimers()
  const order = (tradeNo: string, status: string) => ({
    id: 1,
    user_id: 1,
    amount: 10,
    money: 10,
    trade_no: tradeNo,
    payment_method: 'alipay',
    create_time: 1,
    status,
  })
  const get = vi.spyOn(api, 'get')
  get
    .mockResolvedValueOnce({
      data: {
        success: true,
        data: { total: 1, items: [order('order-123', 'pending')] },
      },
    })
    .mockResolvedValueOnce({
      data: {
        success: true,
        data: { total: 1, items: [order('other', 'success')] },
      },
    })
    .mockResolvedValueOnce({
      data: {
        success: true,
        data: { total: 1, items: [order('order-123', 'success')] },
      },
    })
  const onConfirmed = vi.fn().mockResolvedValue(undefined)

  const firstPage = renderHook(() => useTopupConfirmation(onConfirmed))
  act(() => firstPage.result.current.watchOrder('order-123'))
  await act(async () => {})
  expect(firstPage.result.current.pendingTradeNo).toBe('order-123')
  firstPage.unmount()

  const returnPage = renderHook(() => useTopupConfirmation(onConfirmed))
  expect(returnPage.result.current.pendingTradeNo).toBe('order-123')
  await act(async () => {})
  expect(onConfirmed).not.toHaveBeenCalled()

  await act(async () => vi.advanceTimersByTimeAsync(5_000))
  expect(onConfirmed).toHaveBeenCalledOnce()
  expect(returnPage.result.current.pendingTradeNo).toBeNull()
  expect(sessionStorage.length).toBe(0)
  expect(get).toHaveBeenCalledWith(expect.stringContaining('keyword=order-123'))

  await act(async () => vi.advanceTimersByTimeAsync(5_000))
  expect(get).toHaveBeenCalledTimes(3)
})
