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
import i18next from 'i18next'
import { useEffect, useState } from 'react'

import { isHttpUrl } from '@/lib/content-format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getHomePageContent } from '../api'
import type { HomePageContentResult } from '../types'

const STORAGE_KEY = 'home_page_content'

/**
 * Hook to load and manage custom home page content
 * Supports both Markdown/HTML content and iframe URLs
 */
export function useHomePageContent(): HomePageContentResult {
  const [home, setHome] = useState(() => {
    let cached: string | null = null
    try {
      cached = localStorage.getItem(STORAGE_KEY)
    } catch {
      // Storage can be unavailable; the network request still loads the page.
    }
    return { content: cached ?? '', isLoaded: cached !== null }
  })

  useEffect(() => {
    let mounted = true

    const loadContent = async () => {
      try {
        const response = requireServerSuccess(await getHomePageContent())

        if (!mounted) return

        const content = response.data ?? ''
        setHome({ content, isLoaded: true })
        try {
          // An empty value records the default homepage, so it also renders
          // immediately on the next visit while the server is revalidated.
          localStorage.setItem(STORAGE_KEY, content)
        } catch {
          // A full or blocked cache must not hide successfully fetched content.
        }
      } catch (error) {
        if (!mounted) return
        handleServerError(error, i18next.t('Failed to load home page content'))
      } finally {
        if (mounted) {
          setHome((current) =>
            current.isLoaded ? current : { ...current, isLoaded: true }
          )
        }
      }
    }

    loadContent()

    return () => {
      mounted = false
    }
  }, [])

  return { ...home, isUrl: isHttpUrl(home.content) }
}
