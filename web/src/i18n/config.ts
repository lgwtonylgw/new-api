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
import i18n, { type BackendModule, type ReadCallback } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import {
  convertDetectedLanguage,
  DEFAULT_INTERFACE_LANGUAGE,
  normalizeInterfaceLanguage,
  toIntlLocale,
} from './languages'
import zhCN from './locales/zh.json'

const localeLoaders = {
  zhTW: () => import('./locales/zh-TW.json'),
  zhCN: () => import('./locales/zh.json'),
  en: () => import('./locales/en.json'),
  fr: () => import('./locales/fr.json'),
  ru: () => import('./locales/ru.json'),
  ja: () => import('./locales/ja.json'),
  vi: () => import('./locales/vi.json'),
} as const

const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init() {},
  async read(language: string, _namespace: string, callback: ReadCallback) {
    const normalizedLanguage = normalizeInterfaceLanguage(language)
    const loader =
      localeLoaders[normalizedLanguage as keyof typeof localeLoaders]

    try {
      const module = await loader()
      callback(null, module.default.translation)
    } catch (error: unknown) {
      callback(
        error instanceof Error
          ? error
          : new Error(`Failed to load locale: ${normalizedLanguage}`),
        false
      )
    }
  },
}

export const i18nReady = i18n
  .use(LanguageDetector)
  .use(lazyLocaleBackend)
  .use(initReactI18next)
  .init({
    // Bundle the default locale with the entry chunk so first-time visitors can
    // render immediately. Other locales remain lazy-loaded.
    resources: {
      zhCN,
    },
    partialBundledLanguages: true,
    // Keep each visitor on one locale bundle. When no language was saved,
    // normalizeInterfaceLanguage falls back to Simplified Chinese.
    fallbackLng: (language) => normalizeInterfaceLanguage(language),
    supportedLngs: Object.keys(localeLoaders),
    load: 'currentOnly',
    nsSeparator: false, // Allow literal colons in keys (e.g., URLs, labels)
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    react: {
      // Keep the application usable while a non-default locale is loading or
      // when its lazy chunk cannot be downloaded.
      useSuspense: false,
    },
    detection: {
      // First-time visitors use Simplified Chinese. Once selected, a user's
      // explicit choice is restored from localStorage.
      order: ['localStorage'],
      caches: ['localStorage'],
      // Normalize cached BCP-47 and interface-specific language codes.
      convertDetectedLanguage,
    },
  })

function syncDocumentLanguage(language: string) {
  document.documentElement.lang = toIntlLocale(language) ?? 'zh-CN'
}

i18n.on('languageChanged', syncDocumentLanguage)
syncDocumentLanguage(
  i18n.resolvedLanguage || i18n.language || DEFAULT_INTERFACE_LANGUAGE
)

export default i18n
