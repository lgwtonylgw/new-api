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
export const MAIN_SITE_ORIGIN = 'https://tokenaigate.com'
export const DOCUMENTATION_ORIGIN = 'https://docs.tokenaigate.com'

const mainHostname = new URL(MAIN_SITE_ORIGIN).hostname
const documentationHostname = new URL(DOCUMENTATION_ORIGIN).hostname

export function isDocumentationHost(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.hostname === documentationHostname
  )
}

/** Console links stay local in development and use the main site from documentation. */
export function getMainSiteHref(path: string): string {
  if (!isDocumentationHost() || !path.startsWith('/') || path.startsWith('//')) {
    return path
  }
  return `${MAIN_SITE_ORIGIN}${path}`
}

/** Use the dedicated host in production while retaining /docs for local development. */
export function getDocumentationHref(): string {
  if (isDocumentationHost()) return '/'
  if (
    typeof window !== 'undefined' &&
    window.location.hostname === mainHostname
  ) {
    return `${DOCUMENTATION_ORIGIN}/`
  }
  return '/docs'
}

/** Canonicalize documentation URLs and send account pages back to the main origin. */
export function resolveDocumentationRedirect(href: string): string | null {
  const origin =
    typeof window === 'undefined' ? MAIN_SITE_ORIGIN : window.location.origin
  const source = new URL(href, origin)
  const pathname = source.pathname.replace(/\/+$/, '') || '/'
  const documentationPath =
    pathname === '/docs' || pathname.startsWith('/docs/')
  const documentationHome =
    pathname === '/docs' ||
    pathname === '/docs/overview' ||
    pathname === '/help'
  let target: URL

  if (source.hostname === documentationHostname) {
    if (documentationHome) {
      target = new URL(DOCUMENTATION_ORIGIN)
    } else if (pathname === '/' || documentationPath) {
      return null
    } else {
      target = new URL(MAIN_SITE_ORIGIN)
      target.pathname = source.pathname
    }
  } else if (
    source.hostname === mainHostname &&
    (documentationPath || pathname === '/help')
  ) {
    target = new URL(DOCUMENTATION_ORIGIN)
    if (!documentationHome) target.pathname = source.pathname
  } else {
    return null
  }

  // Preserve deep links without reading or appending authentication state.
  target.search = source.search
  target.hash = source.hash
  return target.href
}
