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
import { BookOpen, Search } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { getDocumentationHref } from '@/lib/site-urls'
import { cn } from '@/lib/utils'

import { TELEGRAM_CHANNEL_URL } from '../constants'
import type { DocArticle } from '../types'
import { DocLink } from './doc-link'

type DocsNavigationProps = {
  articles: DocArticle[]
  activeId: string
  query: string
  onQueryChange: (value: string) => void
  onNavigate: () => void
}

export function DocsNavigation(props: DocsNavigationProps) {
  const { t } = useTranslation()
  const searchId = useId()
  const groups = [...new Set(props.articles.map((article) => article.group))]
  return (
    <div className='space-y-7'>
      <Link
        to={getDocumentationHref()}
        onClick={props.onNavigate}
        className='flex items-center gap-2.5 text-base font-semibold'
      >
        <BookOpen aria-hidden='true' className='text-primary size-5' />
        {t('Help documentation')}
      </Link>
      <div className='relative'>
        <label htmlFor={searchId} className='sr-only'>
          {t('Search documentation')}
        </label>
        <Search
          aria-hidden='true'
          className='text-muted-foreground absolute top-3 left-3 size-4'
        />
        <Input
          id={searchId}
          type='search'
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder={t('Search documentation')}
          className='h-10 pl-9'
        />
      </div>
      <nav aria-label={t('Documentation chapters')} className='space-y-6'>
        {groups.map((group) => (
          <div key={group}>
            <p className='text-muted-foreground mb-2 px-3 text-xs font-semibold tracking-wide'>
              {group}
            </p>
            <ul className='space-y-1'>
              {props.articles
                .filter((article) => article.group === group)
                .map((article) => (
                  <li key={article.id}>
                    <Link
                      to={
                        article.id === 'overview'
                          ? getDocumentationHref()
                          : '/docs/$article'
                      }
                      params={{ article: article.id }}
                      onClick={props.onNavigate}
                      aria-current={
                        props.activeId === article.id ? 'page' : undefined
                      }
                      className={cn(
                        'hover:bg-accent focus-visible:ring-ring block rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2',
                        props.activeId === article.id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {article.id === 'overview'
                        ? t('Documentation home')
                        : article.title}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className='border-t pt-5'>
        <DocLink
          link={{ label: t('Telegram channel'), href: TELEGRAM_CHANNEL_URL }}
          className='text-muted-foreground hover:text-primary focus-visible:ring-ring flex items-center justify-between rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2'
        />
      </div>
    </div>
  )
}
