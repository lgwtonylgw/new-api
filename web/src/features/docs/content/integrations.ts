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
      ],
    },
    {
      id: 'codex',
      group,
      title: t('Codex setup'),
      description: t('Connect Codex CLI using a custom Responses provider.'),
      sections: [
        {
          id: 'codex-config',
          title: t('Configure the provider'),
          paragraphs: [
            t(
              'Install Codex using its official instructions. Back up your user-level ~/.codex/config.toml, then merge the configuration below. Replace YOUR_MODEL_ID with an available model that supports Responses and coding tools.'
            ),
          ],
          code: [
            {
              language: 'toml',
              title: '~/.codex/config.toml',
              value: `model = "YOUR_MODEL_ID"\nmodel_provider = "tokenaigate"\n\n[model_providers.tokenaigate]\nname = "Token AI Gate"\nbase_url = ${JSON.stringify(`${root}/v1`)}\nwire_api = "responses"\nenv_key = "TOKEN_AI_GATE_API_KEY"`,
            },
          ],
          note: t(
            'Use the user-level config file, including on Windows: %USERPROFILE%\\.codex\\config.toml. Merge with existing settings instead of replacing the entire file.'
          ),
        },
        {
          id: 'codex-key',
          title: t('Set the key and launch'),
          code: [
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
            'Replace YOUR_API_KEY locally. These environment variables apply to the current terminal session; never share the completed command or commit secrets to a repository.'
          ),
          paragraphs: [
            t(
              'Start a short task and check Usage Logs. A working Chat Completions model alone does not guarantee Codex tool or Responses compatibility.'
            ),
          ],
          links: [
            {
              label: t('Official Codex documentation'),
              href: 'https://developers.openai.com/codex/config-advanced/',
            },
          ],
        },
      ],
    },
    {
      id: 'claude-code',
      group,
      title: t('Claude Code setup'),
      description: t(
        'Connect Claude Code CLI to the Anthropic-compatible gateway.'
      ),
      sections: [
        {
          id: 'claude-config',
          title: t('Set the gateway environment'),
          paragraphs: [
            t(
              'Install Claude Code using its official instructions. Select an available Claude model supporting Messages and tool use, and replace YOUR_CLAUDE_MODEL_ID below.'
            ),
          ],
          code: [
            {
              language: 'powershell',
              title: 'Windows · PowerShell',
              value: `$env:ANTHROPIC_BASE_URL = '${root.replaceAll("'", "''")}'\n$env:ANTHROPIC_AUTH_TOKEN = "YOUR_API_KEY"\n$env:ANTHROPIC_MODEL = "YOUR_CLAUDE_MODEL_ID"\nclaude`,
            },
            {
              language: 'bash',
              title: 'macOS / Linux · Bash',
              value: `export ANTHROPIC_BASE_URL='${root.replaceAll("'", "'\\''")}'\nexport ANTHROPIC_AUTH_TOKEN="YOUR_API_KEY"\nexport ANTHROPIC_MODEL="YOUR_CLAUDE_MODEL_ID"\nclaude`,
            },
          ],
          note: t(
            'ANTHROPIC_BASE_URL uses the gateway root without /v1. Check for conflicting credentials or provider settings in your existing Claude Code configuration.'
          ),
        },
        {
          id: 'claude-verify',
          title: t('Confirm the connection'),
          paragraphs: [
            t(
              'In Claude Code, use /status to inspect the active endpoint and model, then send a short prompt. Check the corresponding request in Usage Logs. Model and tool support depend on the selected route.'
            ),
            t(
              'These instructions are for the CLI. Desktop applications and managed installations may use different configuration; follow the official guide for your version.'
            ),
          ],
          links: [
            {
              label: t('Official Claude Code documentation'),
              href: 'https://code.claude.com/docs/en/llm-gateway-connect',
            },
          ],
        },
      ],
    },
  ]
}
