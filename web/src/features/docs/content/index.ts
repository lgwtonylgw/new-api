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
import type { TFunction } from 'i18next'

import type { DocArticle } from '../types'
import { getApiExamplesDoc } from './api-examples'
import { getBillingAndSupportDocs } from './billing-and-support'
import { getGettingStartedDocs } from './getting-started'
import { getIntegrationDocs } from './integrations'

export const DOC_ARTICLE_IDS = [
  'overview',
  'quickstart',
  'api-keys',
  'clients',
  'codex',
  'claude-code',
  'api-examples',
  'billing',
  'recharge',
  'usage',
  'troubleshooting',
  'faq',
  'support',
] as const

export function getDocumentation(
  t: TFunction,
  root: string,
  siteName: string
): DocArticle[] {
  return [
    ...getGettingStartedDocs(t, siteName),
    ...getIntegrationDocs(t, root),
    getApiExamplesDoc(t, root),
    ...getBillingAndSupportDocs(t),
  ]
}

export function searchDocumentation(
  articles: DocArticle[],
  query: string
): DocArticle[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return articles.filter((article) => {
    const text = [
      article.title,
      article.description,
      article.group,
      ...article.sections.flatMap((section) => [
        section.title,
        ...(section.paragraphs ?? []),
        ...(section.steps ?? []),
        section.note ?? '',
        ...(section.table?.rows.flat() ?? []),
        ...(section.code?.map((code) => code.value) ?? []),
      ]),
    ]
      .join(' ')
      .toLocaleLowerCase()
    return terms.every((term) => text.includes(term))
  })
}
