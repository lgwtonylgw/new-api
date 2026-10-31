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

export function getGettingStartedDocs(
  t: TFunction,
  siteName: string
): DocArticle[] {
  const group = t('Getting started')
  return [
    {
      id: 'overview',
      group,
      title: t('{{siteName}} documentation', { siteName }),
      description: t(
        'Create a key, connect your tools, and understand your usage in one place.'
      ),
      sections: [
        {
          id: 'start-here',
          title: t('Find your starting point'),
          paragraphs: [
            t(
              'New here? Follow the quickstart for your first request, then choose a guide for your workflow.'
            ),
          ],
          links: [
            { label: t('Quickstart'), article: 'quickstart' },
            { label: t('Account and API keys'), article: 'api-keys' },
            { label: t('Clients and API addresses'), article: 'clients' },
            { label: t('Codex setup'), article: 'codex' },
            { label: t('Claude Code setup'), article: 'claude-code' },
            { label: t('API examples'), article: 'api-examples' },
          ],
        },
        {
          id: 'before-you-connect',
          title: t('Before you connect'),
          steps: [
            t(
              'Prepare an API key, the API base URL, and an exact model ID from the console.'
            ),
            t(
              'Check your account balance, key quota, and the models available to your key group.'
            ),
          ],
          note: t(
            'Model availability, prices, payment methods, and exchange rates follow the current console and checkout page.'
          ),
        },
        {
          id: 'console-shortcuts',
          title: t('Console shortcuts'),
          links: [
            { label: t('Console'), to: '/dashboard' },
            { label: t('API Keys'), to: '/keys' },
            { label: t('Model Square'), to: '/pricing' },
            { label: t('Wallet'), to: '/wallet' },
            { label: t('Usage Logs'), to: '/usage-logs' },
          ],
        },
      ],
    },
    {
      id: 'quickstart',
      group,
      title: t('Quickstart'),
      description: t('Make your first API request in four steps.'),
      sections: [
        {
          id: 'create-account',
          title: t('Create your account'),
          paragraphs: [
            t(
              'Register using an available sign-up method and complete any required email verification. Read the service terms and confirm the service region declaration before registering.'
            ),
          ],
          links: [
            { label: t('Sign Up'), to: '/sign-up' },
            { label: t('User Agreement'), to: '/user-agreement' },
          ],
        },
        {
          id: 'prepare-balance',
          title: t('Prepare your balance'),
          paragraphs: [
            t(
              'Open Wallet to check your balance and available recharge options. Review the amount and currency on the checkout page before paying.'
            ),
          ],
          links: [{ label: t('Recharge guide'), article: 'recharge' }],
        },
        {
          id: 'create-key',
          title: t('Create an API key'),
          paragraphs: [
            t(
              'Open API Keys, create a named key, and select the appropriate group, quota, expiration, and model restrictions. Copy the connection information for your client.'
            ),
          ],
          links: [{ label: t('API Keys'), to: '/keys' }],
        },
        {
          id: 'first-request',
          title: t('Send your first request'),
          paragraphs: [
            t(
              'Copy an exact model ID from Model Square. Use the API examples or configure an OpenAI-compatible client, then confirm the request in Usage Logs.'
            ),
          ],
          links: [
            { label: t('API examples'), article: 'api-examples' },
            { label: t('Clients and API addresses'), article: 'clients' },
          ],
        },
      ],
    },
    {
      id: 'api-keys',
      group,
      title: t('Account and API keys'),
      description: t(
        'Give each application its own key and keep control of access.'
      ),
      sections: [
        {
          id: 'key-settings',
          title: t('Choose key settings'),
          steps: [
            t(
              'Use a separate, recognizable key name for each application or device.'
            ),
            t(
              'Set a suitable quota and expiration. Check model and IP restrictions if your request is rejected.'
            ),
            t(
              'Choose a group that includes the models you need. Availability and pricing can differ between groups.'
            ),
          ],
          links: [{ label: t('API Keys'), to: '/keys' }],
        },
        {
          id: 'key-safety',
          title: t('Protect and rotate keys'),
          paragraphs: [
            t(
              'An API key can spend your balance within its permissions. Store it in an environment variable or a trusted client. Never put it in public code, browser frontend bundles, screenshots, or shared logs.'
            ),
            t(
              'If a key is exposed, disable or delete it immediately, create a replacement, and inspect Usage Logs for unexpected requests.'
            ),
          ],
          note: t(
            'A console login password or personal access token is not a model API key.'
          ),
        },
      ],
    },
  ]
}
