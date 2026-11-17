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
export type SystemInstanceStatus = 'online' | 'stale'

export type SystemInstanceInfo = {
  schema_version?: number
  node?: {
    name?: string
    source?: string
    manually_configured?: boolean
    should_configure_manually?: boolean
    [key: string]: unknown
  }
  role?: {
    is_master?: boolean
    [key: string]: unknown
  }
  runtime?: {
    version?: string
    goos?: string
    goarch?: string
    started_at?: number
    [key: string]: unknown
  }
  host?: {
    hostname?: string
    [key: string]: unknown
  }
  resources?: {
    cpu?: {
      usage_percent?: number
      [key: string]: unknown
    }
    memory?: {
      usage_percent?: number
      [key: string]: unknown
    }
    storage?: {
      total_bytes?: number
      used_bytes?: number
      free_bytes?: number
      used_percent?: number
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type SystemInstance = {
  node_name: string
  status: SystemInstanceStatus
  stale_after_seconds: number
  started_at: number
  last_seen_at: number
  info?: SystemInstanceInfo
}

export type SystemInstanceListResponse = {
  success: boolean
  message: string
  data?: SystemInstance[]
}

export type SystemInstanceDeleteResponse = {
  success: boolean
  message: string
  data?: {
    deleted_count: number
  }
}

export type SystemTaskHistoryDeleteResponse = {
  success: boolean
  message: string
  data?: { deleted_count: number }
}

export type SystemMetricRange = '1h' | '6h' | '24h' | '7d' | '30d'

export type SystemMetricSample = {
  sampled_at: number
  cpu_usage: number
  memory_usage: number
  memory_total_bytes: number
  memory_used_bytes: number
  memory_available_bytes: number
  storage_usage: number
  storage_total_bytes: number
  storage_used_bytes: number
  storage_free_bytes: number
}

export type SystemMetricHistory = {
  node_name: string
  range: SystemMetricRange
  sample_interval_seconds: number
  bucket_seconds: number
  retention_days: number
  samples: SystemMetricSample[]
}

export type SystemMetricHistoryResponse = {
  success: boolean
  message: string
  data?: SystemMetricHistory
}
