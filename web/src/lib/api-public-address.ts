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
import { isDocumentationHost, MAIN_SITE_ORIGIN } from '@/lib/site-urls'
import type { StatusData } from '@/lib/status-query'

/** Public relay root for client imports and examples; never a console API base. */
export function getApiPublicAddress(status: StatusData | null): string {
  const data = status?.data as StatusData | undefined
  const candidates = [
    status?.api_public_address,
    data?.api_public_address,
    status?.server_address,
    status?.serverAddress,
    data?.server_address,
    data?.serverAddress,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(/\/+$/, '')
    }
  }
  if (typeof window === 'undefined') return ''
  return isDocumentationHost() ? MAIN_SITE_ORIGIN : window.location.origin
}
