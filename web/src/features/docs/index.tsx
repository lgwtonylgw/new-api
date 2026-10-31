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
import { BookOpen, List, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { EmptyState } from '@/components/empty-state'
import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { getApiPublicAddress } from '@/lib/api-public-address'

import { DocsArticle } from './components/docs-article'
import { DocsNavigation } from './components/docs-navigation'
import { getDocumentation, searchDocumentation } from './content'

export function Documentation(props: { articleId?: string }) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { systemName } = useSystemConfig()
  const root = getApiPublicAddress(status)
  const articles = useMemo(
    () => getDocumentation(t, root, systemName),
    [t, root, systemName]
  )
  const activeId = props.articleId ?? 'overview'
  const articleIndex = articles.findIndex((article) => article.id === activeId)
  const article = articles[articleIndex] ?? articles[0]
  const [query, setQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const results = useMemo(
    () => searchDocumentation(articles, query),
    [articles, query]
  )
  const isSearching = query.trim().length > 0

  const handleNavigate = () => {
    setQuery('')
    setMobileOpen(false)
  }

  useEffect(() => {
    const previous = document.title
    document.title = `${article.title} · ${systemName}`
    return () => {
      document.title = previous
    }
  }, [article.title, systemName])

  useEffect(() => {
    if (!window.location.hash) {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [activeId])

  return (
    <PublicLayout showMainContainer={false}>
      <a
        href='#documentation-content'
        className='bg-background focus:ring-ring sr-only fixed top-20 left-4 z-50 rounded-lg p-3 focus:not-sr-only focus:ring-2'
      >
        {t('Skip to documentation')}
      </a>
      <div className='border-border/60 border-b pt-16'>
        <div className='mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6'>
          <p className='text-muted-foreground flex items-center gap-2 text-sm'>
            <BookOpen aria-hidden='true' className='text-primary size-4' />
            {t('Documentation center')}
          </p>
          <Button variant='outline' size='sm' render={<Link to='/keys' />}>
            {t('API Keys')}
          </Button>
        </div>
      </div>
      <div className='bg-background/95 sticky top-16 z-20 border-b backdrop-blur lg:hidden'>
        <div className='flex items-center justify-between gap-3 px-4 py-2'>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant='ghost' size='sm' />}>
              <List aria-hidden='true' className='size-4' />
              {t('Documentation chapters')}
            </SheetTrigger>
            <SheetContent
              side='left'
              className='flex w-80 max-w-[90vw] flex-col'
            >
              <SheetHeader>
                <SheetTitle>{t('Documentation chapters')}</SheetTitle>
              </SheetHeader>
              <div className='min-h-0 overflow-y-auto px-5 pb-8'>
                <DocsNavigation
                  articles={results}
                  activeId={activeId}
                  query={query}
                  onQueryChange={setQuery}
                  onNavigate={handleNavigate}
                />
                {isSearching && results.length === 0 && (
                  <p
                    role='status'
                    className='text-muted-foreground mt-6 text-sm'
                  >
                    {t('No matching articles')}
                  </p>
                )}
              </div>
            </SheetContent>
          </Sheet>
          <span className='text-muted-foreground truncate text-xs'>
            {activeId === 'overview' ? t('Documentation home') : article.title}
          </span>
        </div>
      </div>
      <div className='mx-auto grid max-w-7xl gap-10 px-4 py-8 md:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-12 lg:py-10 xl:grid-cols-[230px_minmax(0,1fr)_170px]'>
        <aside className='sticky top-24 hidden max-h-[calc(100svh-7rem)] overflow-y-auto border-r pr-5 pb-4 lg:block'>
          <DocsNavigation
            articles={results}
            activeId={activeId}
            query={query}
            onQueryChange={setQuery}
            onNavigate={handleNavigate}
          />
        </aside>
        <main
          id='documentation-content'
          tabIndex={-1}
          className='min-w-0 scroll-mt-28 outline-none'
        >
          {isSearching ? (
            <section aria-labelledby='search-results-title'>
              <h1 id='search-results-title' className='mb-6 text-2xl font-bold'>
                {t('Documentation search results')}
              </h1>
              {results.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title={t('No matching articles')}
                  description={t(
                    'Try a model, client name, payment method, or HTTP status.'
                  )}
                  action={
                    <Button variant='outline' onClick={() => setQuery('')}>
                      {t('Clear search')}
                    </Button>
                  }
                />
              ) : (
                <ul
                  className='space-y-3'
                  aria-label={t('Documentation search results')}
                >
                  {results.map((result) => (
                    <li key={result.id}>
                      <Link
                        to='/docs/$article'
                        params={{ article: result.id }}
                        onClick={handleNavigate}
                        className='hover:border-primary/30 focus-visible:ring-ring block rounded-xl border p-5 outline-none focus-visible:ring-2'
                      >
                        <p className='text-primary mb-2 text-xs'>
                          {result.group}
                        </p>
                        <h2 className='font-semibold'>{result.title}</h2>
                        <p className='text-muted-foreground mt-2 text-sm leading-6'>
                          {result.description}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p role='status' className='sr-only'>
                {t('Matching articles: {{count}}', { count: results.length })}
              </p>
            </section>
          ) : (
            <>
              <div className='bg-muted/40 mb-8 flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3'>
                <div className='min-w-0 flex-1'>
                  <p className='text-muted-foreground mb-1 text-xs'>
                    {t('OpenAI-compatible base URL')}
                  </p>
                  <code className='block overflow-x-auto text-sm'>
                    {root}/v1
                  </code>
                </div>
                <CopyButton
                  value={`${root}/v1`}
                  aria-label={t('Copy API base URL')}
                />
              </div>
              <DocsArticle
                article={article}
                previous={articles[articleIndex - 1]}
                next={articles[articleIndex + 1]}
              />
            </>
          )}
        </main>
        {!isSearching && (
          <aside className='sticky top-24 hidden max-h-[calc(100svh-7rem)] overflow-y-auto xl:block'>
            <nav aria-label={t('On this page')} className='border-l pl-4'>
              <p className='mb-4 text-xs font-semibold'>{t('On this page')}</p>
              <ul className='space-y-3'>
                {article.sections.map((section) => (
                  <li key={section.id}>
                    <Link
                      to='/docs/$article'
                      params={{ article: article.id }}
                      hash={section.id}
                      className='text-muted-foreground hover:text-primary block text-xs leading-5'
                    >
                      {section.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
      <Footer />
    </PublicLayout>
  )
}
