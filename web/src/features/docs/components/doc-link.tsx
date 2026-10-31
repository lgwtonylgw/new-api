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
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'

import { getDocumentationHref, getMainSiteHref } from '@/lib/site-urls'

import type { DocLink as DocLinkData } from '../types'

export function DocLink(props: { link: DocLinkData; className?: string }) {
  if (props.link.article) {
    return (
      <Link
        to={
          props.link.article === 'overview'
            ? getDocumentationHref()
            : '/docs/$article'
        }
        params={{ article: props.link.article }}
        className={props.className}
      >
        {props.link.label}
      </Link>
    )
  }
  if (props.link.href) {
    return (
      <a
        href={props.link.href}
        target='_blank'
        rel='noopener noreferrer'
        className={props.className}
      >
        {props.link.label}
        <ArrowUpRight aria-hidden='true' className='ml-1 inline size-3.5' />
      </a>
    )
  }
  if (props.link.to) {
    return (
      <Link to={getMainSiteHref(props.link.to)} className={props.className}>
        {props.link.label}
      </Link>
    )
  }
  return null
}
