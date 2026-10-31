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
import { getClaudeCodeDoc } from './claude-code'
import { getCodexDoc } from './codex'
import { getCodexPlatformDocs } from './codex-platforms'

export function getIntegrationDocs(t: TFunction, root: string): DocArticle[] {
  const group = t('Integration guides')
  return [
    {
      id: 'clients',
      group,
      title: t('Clients and API addresses'),
      description: t(
        'Use the right base URL for the protocol your client supports.'
      ),
      sections: [
        {
          id: 'api-addresses',
          title: t('API address reference'),
          table: {
            headers: [t('Protocol'), t('Base URL'), t('Request path')],
            rows: [
              ['OpenAI', `${root}/v1`, '/chat/completions'],
              ['OpenAI Responses', `${root}/v1`, '/responses'],
              ['Anthropic', root, '/v1/messages'],
              ['Gemini', `${root}/v1beta`, '/models/{model}:generateContent'],
            ],
          },
          note: t(
            'These paths describe gateway protocols. Check each model in Model Square for the endpoints it actually supports.'
          ),
        },
        {
          id: 'chat-clients',
          title: t('Connect a chat client'),
          steps: [
            t(
              'In Cherry Studio, Chatbox, or another compatible client, add an OpenAI-compatible provider.'
            ),
            t(
              'Paste the OpenAI base URL shown above, add your API key, and enter an exact available model ID.'
            ),
            t(
              'Save and send a short message. If the client appends /v1 automatically, use the gateway root instead to avoid /v1/v1.'
            ),
          ],
          note: t(
            'A base URL is different from a full endpoint URL. Only enter /chat/completions when the client explicitly asks for the complete request URL.'
          ),
        },
        {
          id: 'connection-tools',
          title: t('Import connection settings'),
          paragraphs: [
            t(
              'The API Keys page provides connection information and supported import tools. Review the destination application and selected key before importing.'
            ),
          ],
          links: [
            { label: t('API Keys'), to: '/keys' },
            { label: t('Codex setup'), article: 'codex' },
            { label: t('Claude Code setup'), article: 'claude-code' },
          ],
        },
        {
          id: 'client-checklist',
          title: t('Client connection checklist'),
          table: {
            headers: [t('Field'), t('What to enter')],
            rows: [
              [t('Base URL'), `${root}/v1`],
              [
                t('API Key'),
                t('The complete site API key copied from API Keys.'),
              ],
              [
                t('Model'),
                t('An exact model ID available to the selected key group.'),
              ],
            ],
          },
          paragraphs: [
            t(
              'Start with one provider, one key, and one model. Verify a short text request before enabling tools, images, search, or automatic model switching.'
            ),
            t(
              'If the model list does not load, enter a supported model ID manually and inspect the error. A client may use a different discovery endpoint from its chat endpoint.'
            ),
          ],
          links: [{ label: t('API examples'), article: 'api-examples' }],
        },
      ],
    },
    getCodexDoc(t, root),
    ...getCodexPlatformDocs(t, root),
    getClaudeCodeDoc(t, root),
  ]
}
