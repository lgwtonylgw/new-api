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
import { formatLogQuota, formatTimestampToDate } from '@/lib/format'

import type { UsageLog } from '../data/schema'
import {
  getCacheWriteTokens,
  logTokenName,
  parseLogOther,
  renderLogContent,
} from './format'
import {
  getLogTypeConfig,
  isDisplayableLogType,
  isTimingLogType,
} from './utils'

type Translate = (key: string, options?: Record<string, unknown>) => string

const CSV_MEMORY_FALLBACK_MAX_ROWS = 50_000

type WritableFile = {
  write: (data: string) => Promise<void>
  close: () => Promise<void>
  abort: (reason?: unknown) => Promise<void>
}

type SaveFilePicker = (options: {
  suggestedName: string
  types: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}) => Promise<{ createWritable: () => Promise<WritableFile> }>

export type CsvDownloadSink = {
  write: (line: string) => Promise<void>
  close: () => Promise<void>
  abort: (reason?: unknown) => Promise<void>
}

export class CsvExportMemoryLimitError extends Error {
  constructor() {
    super(
      `CSV export exceeds the ${CSV_MEMORY_FALLBACK_MAX_ROWS} row browser limit`
    )
    this.name = 'CsvExportMemoryLimitError'
  }
}

/**
 * Column titles of the exported log file. User and channel columns are only
 * in the administrator view, matching the log table.
 */
export function getLogCsvHeader(isAdmin: boolean, t: Translate): string[] {
  return [
    t('Time'),
    t('Type'),
    ...(isAdmin ? [t('User')] : []),
    t('Token'),
    t('Group'),
    t('Model'),
    ...(isAdmin ? [t('Channel')] : []),
    t('Stream'),
    t('Input Tokens'),
    t('Output Tokens'),
    t('Cache Read'),
    t('Cache Write'),
    t('Cost'),
    t('Duration'),
    t('IP'),
    t('Request ID'),
    t('Details'),
  ]
}

/** One log as the cells under getLogCsvHeader, shown as in the log table. */
export function getLogCsvRow(
  log: UsageLog,
  isAdmin: boolean,
  t: Translate
): string[] {
  const other = parseLogOther(log.other ?? '')
  const usage = isDisplayableLogType(log.type)
  const cacheWrite = getCacheWriteTokens(other)
  let channel = ''
  if (log.channel) {
    channel = log.channel_name
      ? `#${log.channel} ${log.channel_name}`
      : `#${log.channel}`
  }
  return [
    formatTimestampToDate(log.created_at),
    t(getLogTypeConfig(log.type).label),
    ...(isAdmin ? [log.username ?? ''] : []),
    logTokenName(log, t),
    log.group ?? '',
    log.model_name ?? '',
    ...(isAdmin ? [channel] : []),
    usage ? t(log.is_stream ? 'Yes' : 'No') : '',
    usage ? String(log.prompt_tokens ?? 0) : '',
    usage ? String(log.completion_tokens ?? 0) : '',
    usage ? String(other?.cache_tokens ?? 0) : '',
    usage ? String(cacheWrite) : '',
    usage ? formatLogQuota(log.quota ?? 0) : '',
    isTimingLogType(log.type) ? `${log.use_time ?? 0}s` : '',
    log.ip ?? '',
    log.request_id ?? '',
    renderLogContent(other, t) ?? log.content ?? '',
  ]
}

/**
 * A CSV line with every cell quoted. Text a spreadsheet would run as a
 * formula gets a leading apostrophe, since logs carry user-entered names.
 */
export function toCsvLine(cells: string[]): string {
  const quoted = cells.map((cell) => {
    const text =
      /^[=+\-@\t\r]/.test(cell) && !/^-?\d+(\.\d+)?$/.test(cell)
        ? `'${cell}`
        : cell
    return `"${text.replaceAll('"', '""')}"`
  })
  return `${quoted.join(',')}\r\n`
}

/** Save CSV lines as a UTF-8 file that spreadsheet apps open correctly. */
export function downloadCsv(filename: string, lines: string[]): void {
  const blob = new Blob(['\uFEFF', ...lines], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Stream CSV to disk when the browser supports the File System Access API.
 * Other browsers use a bounded in-memory fallback instead of growing without
 * limit until the tab runs out of memory.
 */
export async function createCsvDownloadSink(
  filename: string,
  headerLine: string
): Promise<CsvDownloadSink> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker
  if (picker) {
    const handle = await picker.call(window, {
      suggestedName: filename,
      types: [
        {
          description: 'CSV',
          accept: { 'text/csv': ['.csv'] },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write('\uFEFF')
    await writable.write(headerLine)
    return {
      write: (line) => writable.write(line),
      close: () => writable.close(),
      abort: (reason) => writable.abort(reason),
    }
  }

  const lines = [headerLine]
  return {
    async write(line) {
      if (lines.length - 1 >= CSV_MEMORY_FALLBACK_MAX_ROWS) {
        throw new CsvExportMemoryLimitError()
      }
      lines.push(line)
    },
    async close() {
      downloadCsv(filename, lines)
      lines.length = 0
    },
    async abort() {
      lines.length = 0
    },
  }
}
