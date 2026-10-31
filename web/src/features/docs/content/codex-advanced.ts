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

import type { DocSection } from '../types'

export function getCodexAdvancedSections(
  t: TFunction,
  root: string
): DocSection[] {
  return [
    {
      id: 'codex-env',
      title: t('Method B: environment variable credentials'),
      paragraphs: [
        t(
          'For terminal use, choose this provider block instead of Method A. Set requires_openai_auth to false and supply the key through env_key; do not combine the two authentication methods.'
        ),
      ],
      code: [
        {
          language: 'toml',
          title: 'config.toml',
          value: `model = "YOUR_MODEL_ID"\nmodel_provider = "tokenaigate"\nweb_search = "disabled"\n\n[model_providers.tokenaigate]\nname = "Token AI Gate"\nbase_url = ${JSON.stringify(`${root}/v1`)}\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\nenv_key = "TOKEN_AI_GATE_API_KEY"`,
        },
        {
          language: 'powershell',
          title: 'Windows · PowerShell',
          value: '$env:TOKEN_AI_GATE_API_KEY = "YOUR_API_KEY"\ncodex',
        },
        {
          language: 'bash',
          title: 'macOS / Linux · Bash',
          value: 'export TOKEN_AI_GATE_API_KEY="YOUR_API_KEY"\ncodex',
        },
      ],
      note: t(
        'An environment variable belongs to the process that receives it. A desktop or IDE application already running may need a full restart and may not inherit a variable set in another terminal.'
      ),
    },
    {
      id: 'codex-key',
      title: t('Launch and verify Codex'),
      steps: [
        t(
          'Close existing Codex sessions, reopen your terminal or IDE, and start a new local session.'
        ),
        t(
          'Run /status in Codex and check the selected provider and model. With Method A, codex login status also reports the stored login method.'
        ),
        t(
          'Send a short prompt, then match its model and time in Usage Logs. A displayed model name alone does not prove that a request reached this gateway.'
        ),
      ],
      code: [
        {
          language: 'bash',
          title: 'Codex CLI',
          value: 'codex\n# Inside Codex:\n/status',
        },
      ],
      note: t(
        'Local CLI and IDE configuration does not configure browser-based ChatGPT or cloud tasks. For desktop clients, confirm custom-provider support in the official documentation for your version.'
      ),
      links: [{ label: t('Usage Logs'), to: '/usage-logs' }],
    },
    {
      id: 'codex-troubleshooting',
      title: t('Codex setup troubleshooting'),
      table: {
        headers: [t('Symptom'), t('What to check')],
        rows: [
          [
            t('Codex still asks for login'),
            t(
              'For Method A, check auth.json, file storage, and the active CODEX_HOME. For Method B, check the variable in the same terminal and requires_openai_auth = false.'
            ),
          ],
          [
            '401 / 403',
            t(
              'Use a site API key with the complete prefix. Check key quota, group, expiry, and model restrictions; a ChatGPT subscription credential is not a site API key.'
            ),
          ],
          [
            '404 / /v1/v1',
            t(
              'Use a base URL ending in /v1 exactly once. Confirm that the model supports /v1/responses.'
            ),
          ],
          [
            t('WebSocket or stream disconnects'),
            t(
              'Start with supports_websockets = false. Check SSE, network proxies, gateway timeouts, and route availability before enabling extra transports.'
            ),
          ],
          [
            t('Configuration has no effect'),
            t(
              'Check the user directory, duplicate TOML tables, top-level placement, startup flags, and managed settings. Start a new session after edits.'
            ),
          ],
        ],
      },
    },
    {
      id: 'codex-restore',
      title: t('Restore your previous Codex setup'),
      steps: [
        t(
          'Close Codex, restore the matching config.toml and auth.json backups, and restart the affected CLI or IDE.'
        ),
        t(
          'Remove the temporary TOKEN_AI_GATE_API_KEY variable if you no longer use it. Restore your original credential-store setting if you changed it.'
        ),
      ],
      note: t(
        'Changing or clearing Codex login credentials can affect other local clients sharing the same credential store. Keep the backup private and delete it securely when it is no longer needed.'
      ),
    },
  ]
}
