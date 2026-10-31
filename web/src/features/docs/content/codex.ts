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
import { getCodexAdvancedSections } from './codex-advanced'

export function getCodexDoc(t: TFunction, root: string): DocArticle {
  return {
    id: 'codex',
    group: t('Integration guides'),
    title: t('Codex setup'),
    description: t('Connect Codex CLI using a custom Responses provider.'),
    sections: [
      {
        id: 'codex-prepare',
        title: t('Prepare Codex connection details'),
        steps: [
          t(
            'Create a dedicated key in API Keys. Copy its connection information and an exact model ID available to that key group.'
          ),
          t(
            'Choose a Responses-compatible model with streaming and tool support. A successful Chat Completions request alone does not verify Codex compatibility.'
          ),
        ],
        code: [
          {
            language: 'bash',
            title: 'Codex CLI',
            value: 'npm install -g @openai/codex\ncodex --version',
          },
        ],
        links: [
          { label: t('API Keys'), to: '/keys' },
          { label: t('Model Square'), to: '/pricing' },
          {
            label: t('Official Codex documentation'),
            href: 'https://developers.openai.com/codex/cli/',
          },
        ],
      },
      {
        id: 'codex-files',
        title: t('Locate and back up Codex files'),
        table: {
          headers: [t('Environment'), t('Configuration directory')],
          rows: [
            ['Windows', '%USERPROFILE%\\.codex\\'],
            ['macOS / Linux', '~/.codex/'],
            ['WSL', t('The Linux user home inside WSL: ~/.codex/')],
          ],
        },
        paragraphs: [
          t(
            'If CODEX_HOME is set, use that directory. Back up config.toml and auth.json before editing; Windows and WSL can use different home directories and separate credentials.'
          ),
        ],
        code: [
          {
            language: 'powershell',
            title: 'Windows · PowerShell',
            value: `$codexDir = $env:CODEX_HOME\nif ([string]::IsNullOrWhiteSpace($codexDir)) {\n  $codexDir = Join-Path $env:USERPROFILE ".codex"\n}\nNew-Item -ItemType Directory -Path $codexDir -Force | Out-Null\n$backupStamp = Get-Date -Format "yyyyMMdd-HHmmss"\nforeach ($fileName in @("config.toml", "auth.json")) {\n  $sourcePath = Join-Path $codexDir $fileName\n  if (Test-Path -LiteralPath $sourcePath) {\n    Copy-Item -LiteralPath $sourcePath -Destination "$sourcePath.$backupStamp.bak"\n  }\n}\nnotepad (Join-Path $codexDir "config.toml")`,
          },
        ],
        note: t(
          'Edit user-level files. Keep credentials out of the repository, and preserve unrelated settings when merging configuration.'
        ),
      },
      {
        id: 'codex-config',
        title: t('Method A: config.toml and auth.json'),
        paragraphs: [
          t(
            'Use this complete provider example with file-based API key credentials. Replace YOUR_MODEL_ID with your model ID and keep the provider identifier tokenaigate consistent.'
          ),
        ],
        code: [
          {
            language: 'toml',
            title: 'config.toml',
            value: `model = "YOUR_MODEL_ID"\nmodel_provider = "tokenaigate"\ncli_auth_credentials_store = "file"\nweb_search = "disabled"\n\n[model_providers.tokenaigate]\nname = "Token AI Gate"\nbase_url = ${JSON.stringify(`${root}/v1`)}\nwire_api = "responses"\nrequires_openai_auth = true\nsupports_websockets = false`,
          },
        ],
        note: t(
          'The first four lines are top-level TOML settings. Place them before the first [section]; merge the provider table once instead of appending a duplicate table.'
        ),
      },
      {
        id: 'codex-credentials',
        title: t('Save the site API key'),
        paragraphs: [
          t(
            'After backing up the old credentials, put your site API key in auth.json in the same Codex directory. This replaces the active stored login for clients using that credential file.'
          ),
        ],
        code: [
          {
            language: 'json',
            title: 'auth.json',
            value: JSON.stringify({ OPENAI_API_KEY: 'YOUR_API_KEY' }, null, 2),
          },
        ],
        note: t(
          'For this setup, OPENAI_API_KEY contains a key issued by this site. Keep old ChatGPT credentials in your private backup; do not mix them into this example or share the completed file.'
        ),
      },
      {
        id: 'codex-options',
        title: t('What the Codex settings mean'),
        table: {
          headers: [t('Setting'), t('Meaning')],
          rows: [
            [
              'model / model_provider',
              t('Select the exact model ID and the matching provider table.'),
            ],
            [
              'base_url / wire_api',
              t(
                'Use the API address ending in /v1 and the responses protocol. Codex appends /responses itself.'
              ),
            ],
            [
              'requires_openai_auth = true',
              t(
                'Use Codex stored credentials. In this mode env_key is ignored; base_url still selects the model request destination.'
              ),
            ],
            [
              'supports_websockets = false',
              t(
                'Use HTTP/SSE for the initial connection. Enable WebSocket transport only after confirming support across the client, gateway, and upstream route.'
              ),
            ],
            [
              'web_search = "disabled"',
              t(
                'Keep hosted search out of the initial setup. Enable it later only when the chosen route supports that feature.'
              ),
            ],
            [
              'cli_auth_credentials_store = "file"',
              t(
                'Store Codex credentials in auth.json. The file contains a usable secret and must remain private.'
              ),
            ],
          ],
        },
        links: [
          {
            label: t('Codex configuration reference'),
            href: 'https://developers.openai.com/codex/config-reference/',
          },
          {
            label: t('Codex authentication reference'),
            href: 'https://developers.openai.com/codex/auth/',
          },
        ],
      },
      ...getCodexAdvancedSections(t, root),
    ],
  }
}
