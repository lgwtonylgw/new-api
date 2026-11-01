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
import { useCallback, useEffect, useState } from 'react'

import { getUserBillingHistory, isApiSuccess } from '../api'

const CHECK_INTERVAL_MS = 5_000
const MONITOR_DURATION_MS = 10 * 60_000
const PENDING_ORDER_KEY = 'wallet_pending_topup'

interface PendingOrder {
  tradeNo: string
  startedAt: number
}

function readPendingOrder(): PendingOrder | null {
  try {
    const stored = sessionStorage.getItem(PENDING_ORDER_KEY)
    if (!stored) return null

    const order: unknown = JSON.parse(stored)
    if (
      typeof order === 'object' &&
      order !== null &&
      'tradeNo' in order &&
      typeof order.tradeNo === 'string' &&
      'startedAt' in order &&
      typeof order.startedAt === 'number' &&
      Date.now() - order.startedAt < MONITOR_DURATION_MS
    ) {
      return { tradeNo: order.tradeNo, startedAt: order.startedAt }
    }
    sessionStorage.removeItem(PENDING_ORDER_KEY)
  } catch {
    // Storage may be unavailable in private browsing.
  }
  return null
}

function savePendingOrder(order: PendingOrder | null) {
  try {
    if (order) {
      sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(order))
    } else {
      sessionStorage.removeItem(PENDING_ORDER_KEY)
    }
  } catch {
    // The current page can still monitor the order without storage.
  }
}

export function useTopupConfirmation(onConfirmed: () => Promise<void>) {
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(
    readPendingOrder
  )

  const watchOrder = useCallback((tradeNo: string) => {
    const order = { tradeNo, startedAt: Date.now() }
    savePendingOrder(order)
    setPendingOrder(order)
  }, [])

  useEffect(() => {
    if (!pendingOrder) return

    let active = true
    let checking = false

    const checkOrder = async () => {
      if (!active || checking || document.visibilityState === 'hidden') return
      if (Date.now() - pendingOrder.startedAt >= MONITOR_DURATION_MS) {
        savePendingOrder(null)
        setPendingOrder(null)
        return
      }

      checking = true
      try {
        const response = await getUserBillingHistory(1, 1, pendingOrder.tradeNo)
        const confirmed =
          active &&
          isApiSuccess(response) &&
          response.data?.items?.some(
            (order) =>
              order.trade_no === pendingOrder.tradeNo &&
              order.status === 'success'
          )
        if (confirmed) {
          savePendingOrder(null)
          setPendingOrder(null)
          await onConfirmed()
        }
      } catch {
        // A transient network failure should not stop order monitoring.
      } finally {
        checking = false
      }
    }

    void checkOrder()
    const timer = window.setInterval(() => void checkOrder(), CHECK_INTERVAL_MS)
    const checkOnFocus = () => void checkOrder()
    window.addEventListener('focus', checkOnFocus)

    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', checkOnFocus)
    }
  }, [pendingOrder, onConfirmed])

  return { pendingTradeNo: pendingOrder?.tradeNo ?? null, watchOrder }
}
