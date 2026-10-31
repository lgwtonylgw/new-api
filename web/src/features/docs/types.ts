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
export type DocLink =
  | { label: string; article: string; to?: never; href?: never }
  | {
      label: string
      article?: never
      to:
        | '/dashboard'
        | '/sign-up'
        | '/keys'
        | '/pricing'
        | '/wallet'
        | '/usage-logs'
        | '/security'
        | '/user-agreement'
        | '/privacy-policy'
      href?: never
    }
  | { label: string; article?: never; to?: never; href: string }

export type DocSection = {
  id: string
  title: string
  paragraphs?: string[]
  steps?: string[]
  note?: string
  code?: { language: string; title: string; value: string }[]
  table?: { headers: string[]; rows: string[][] }
  links?: DocLink[]
}

export type DocArticle = {
  id: string
  group: string
  title: string
  description: string
  sections: DocSection[]
}
