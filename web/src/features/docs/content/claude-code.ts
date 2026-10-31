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

export function getClaudeCodeDoc(t: TFunction, root: string): DocArticle {
  return {
    id: 'claude-code',
    group: t('Integration guides'),
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
        id: 'claude-settings',
        title: t('Save Claude Code settings for future sessions'),
        paragraphs: [
          t(
            'For persistent local setup, back up ~/.claude/settings.json and merge the env object below. On Windows the default file is %USERPROFILE%\\.claude\\settings.json. Keep existing permissions, hooks, and other settings.'
          ),
        ],
        code: [
          {
            language: 'json',
            title: '~/.claude/settings.json',
            value: JSON.stringify(
              {
                env: {
                  ANTHROPIC_BASE_URL: root,
                  ANTHROPIC_AUTH_TOKEN: 'YOUR_API_KEY',
                  ANTHROPIC_MODEL: 'YOUR_CLAUDE_MODEL_ID',
                },
              },
              null,
              2
            ),
          },
        ],
        note: t(
          'The completed settings file contains your key. Keep it in your private user configuration and out of shared project files or screenshots.'
        ),
      },
      {
        id: 'claude-models',
        title: t('Configure Claude model aliases when needed'),
        paragraphs: [
          t(
            'A primary model can work while a background request fails. If you use model aliases or background tasks, map their defaults to exact Claude model IDs available to your key group.'
          ),
        ],
        code: [
          {
            language: 'json',
            title: 'env',
            value: JSON.stringify(
              {
                ANTHROPIC_DEFAULT_SONNET_MODEL: 'YOUR_SONNET_MODEL_ID',
                ANTHROPIC_DEFAULT_OPUS_MODEL: 'YOUR_OPUS_MODEL_ID',
                ANTHROPIC_DEFAULT_HAIKU_MODEL: 'YOUR_HAIKU_MODEL_ID',
              },
              null,
              2
            ),
          },
        ],
        note: t(
          'Merge only the mappings you need into the same env object and replace every placeholder. An alias does not grant access to a model that your group does not provide.'
        ),
        links: [
          {
            label: t('Claude Code model configuration'),
            href: 'https://code.claude.com/docs/en/model-config',
          },
        ],
      },
      {
        id: 'claude-verify',
        title: t('Confirm the connection'),
        steps: [
          t(
            'Restart Claude Code after changing credentials. Use /status to inspect the active endpoint and /model to inspect or choose a model.'
          ),
          t(
            'Send a short prompt and check Usage Logs. If only a secondary request fails, inspect the model ID in that error and review your alias mappings.'
          ),
        ],
        table: {
          headers: [t('Symptom'), t('What to check')],
          rows: [
            [
              '401 / 403',
              t(
                'Check the site key, group, quota, and any conflicting ANTHROPIC_API_KEY, OAuth, or cloud-provider settings.'
              ),
            ],
            [
              '404',
              t(
                'Use the gateway root for ANTHROPIC_BASE_URL and confirm the selected Claude model supports Messages and tools.'
              ),
            ],
            [
              t('Configuration has no effect'),
              t(
                'Check user, project, environment, and managed settings for conflicts. A managed installation may prevent local provider changes.'
              ),
            ],
          ],
        },
        paragraphs: [
          t(
            'These instructions are for the CLI. Desktop applications and managed installations may use different configuration; follow the official guide for your version.'
          ),
        ],
        links: [
          {
            label: t('Official Claude Code documentation'),
            href: 'https://code.claude.com/docs/en/llm-gateway-connect',
          },
          { label: t('Usage Logs'), to: '/usage-logs' },
        ],
      },
    ],
  }
}
