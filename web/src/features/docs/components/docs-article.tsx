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
import { ArrowLeft, ArrowRight, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CodeBlock } from '@/components/ai-elements/code-block'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { DocArticle } from '../types'
import { DocLink } from './doc-link'

export function DocsArticle(props: {
  article: DocArticle
  previous?: DocArticle
  next?: DocArticle
}) {
  const { t } = useTranslation()
  return (
    <article className='min-w-0' aria-labelledby='docs-title'>
      <header className='border-border/60 mb-10 border-b pb-8'>
        <p className='text-primary mb-3 text-sm font-medium'>
          {props.article.group}
        </p>
        <h1
          id='docs-title'
          tabIndex={-1}
          className='text-3xl leading-tight font-bold tracking-tight break-words outline-none sm:text-4xl'
        >
          {props.article.title}
        </h1>
        <p className='text-muted-foreground mt-5 text-base leading-7'>
          {props.article.description}
        </p>
      </header>
      <div className='space-y-10'>
        {props.article.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className='scroll-mt-28 space-y-4'
            aria-labelledby={`heading-${section.id}`}
          >
            <h2
              id={`heading-${section.id}`}
              className='text-xl font-semibold tracking-tight'
            >
              <Link
                to='/docs/$article'
                params={{ article: props.article.id }}
                hash={section.id}
                className='hover:text-primary'
              >
                {section.title}
              </Link>
            </h2>
            {section.paragraphs?.map((text) => (
              <p
                key={text}
                className='text-muted-foreground text-sm leading-7 break-words'
              >
                {text}
              </p>
            ))}
            {section.steps && (
              <ol className='text-muted-foreground marker:text-primary list-decimal space-y-3 pl-5 text-sm leading-7 marker:font-medium'>
                {section.steps.map((step) => (
                  <li key={step} className='pl-1'>
                    {step}
                  </li>
                ))}
              </ol>
            )}
            {section.table && (
              <div className='overflow-hidden rounded-xl border'>
                <Table>
                  <TableHeader>
                    <TableRow className='bg-muted/60 hover:bg-muted/60'>
                      {section.table.headers.map((header) => (
                        <TableHead key={header} className='px-4 py-3'>
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {section.table.rows.map((row) => (
                      <TableRow key={row[0]}>
                        {row.map((cell) => (
                          <TableCell
                            key={cell}
                            className='px-4 py-3 text-sm leading-6 whitespace-normal'
                          >
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {section.code?.map((code) => (
              <CodeBlock
                key={code.title}
                code={code.value}
                language={code.language}
                title={code.title}
                showLineNumbers={false}
                enableCollapse={false}
                className='min-w-0 overflow-hidden rounded-xl border'
              />
            ))}
            {section.note && (
              <div
                role='note'
                className='bg-primary/5 border-primary/15 flex gap-3 rounded-xl border p-4'
              >
                <Info
                  aria-hidden='true'
                  className='text-primary mt-0.5 size-4 shrink-0'
                />
                <p className='text-muted-foreground min-w-0 text-sm leading-6 break-words'>
                  {section.note}
                </p>
              </div>
            )}
            {section.links && (
              <ul className='grid gap-2 sm:grid-cols-2'>
                {section.links.map((link) => (
                  <li key={link.label}>
                    <DocLink
                      link={link}
                      className='border-border/60 hover:border-primary/30 hover:bg-primary/5 focus-visible:ring-ring flex h-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2'
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <nav
        aria-label={t('Documentation pagination')}
        className='mt-14 grid grid-cols-2 gap-3 border-t pt-6'
      >
        <div>
          {props.previous && (
            <Link
              to='/docs/$article'
              params={{ article: props.previous.id }}
              className='hover:border-primary/30 block h-full rounded-xl border p-4'
            >
              <span className='text-muted-foreground flex items-center gap-1 text-xs'>
                <ArrowLeft aria-hidden='true' className='size-3.5' />
                {t('Previous article')}
              </span>
              <span className='mt-2 block text-sm font-medium'>
                {props.previous.id === 'overview'
                  ? t('Documentation home')
                  : props.previous.title}
              </span>
            </Link>
          )}
        </div>
        <div>
          {props.next && (
            <Link
              to='/docs/$article'
              params={{ article: props.next.id }}
              className='hover:border-primary/30 block h-full rounded-xl border p-4 text-right'
            >
              <span className='text-muted-foreground flex items-center justify-end gap-1 text-xs'>
                {t('Next article')}
                <ArrowRight aria-hidden='true' className='size-3.5' />
              </span>
              <span className='mt-2 block text-sm font-medium'>
                {props.next.title}
              </span>
            </Link>
          )}
        </div>
      </nav>
    </article>
  )
}
