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

import { TELEGRAM_CHANNEL_URL } from '../constants'
import type { DocArticle } from '../types'

export function getBillingAndSupportDocs(t: TFunction): DocArticle[] {
  return [
    {
      id: 'billing',
      group: t('Billing and recharge'),
      title: t('Models and billing'),
      description: t(
        'Check model access and understand the price shown for your group.'
      ),
      sections: [
        {
          id: 'model-access',
          title: t('Choose an available model'),
          paragraphs: [
            t(
              'Model Square shows model IDs, supported endpoints, groups, and current prices. Copy the complete model ID exactly; a similar product name may refer to a different route.'
            ),
          ],
          links: [{ label: t('Model Square'), to: '/pricing' }],
        },
        {
          id: 'understand-prices',
          title: t('Read the price units'),
          paragraphs: [
            t(
              'Some models charge by input and output tokens; others charge per request or task. Read the displayed unit and any cache, image, audio, or other pricing details before use.'
            ),
            t(
              'Long conversations, attached files, and tool calls can increase usage. Your group and selected route may affect the price. Use Usage Logs to inspect actual charges.'
            ),
          ],
          note: t(
            'This guide does not fix a model price or recharge exchange rate. The current console, order, and usage records are authoritative.'
          ),
        },
      ],
    },
    {
      id: 'recharge',
      group: t('Billing and recharge'),
      title: t('Recharge guide'),
      description: t(
        'Recharge through the payment methods currently available in your wallet.'
      ),
      sections: [
        {
          id: 'create-payment',
          title: t('Create a recharge order'),
          steps: [
            t('Open Wallet and choose an available payment method and amount.'),
            t(
              'Review the order currency, payable amount, exchange rate, and payment deadline before confirming.'
            ),
            t(
              'Complete payment on the checkout page, then return to Wallet to check the order and balance.'
            ),
          ],
          links: [{ label: t('Wallet'), to: '/wallet' }],
        },
        {
          id: 'alipay',
          title: t('Pay with Alipay'),
          paragraphs: [
            t(
              'If Alipay is offered, open its checkout page and pay the exact amount shown there. If it differs from the amount first entered, verify the checkout details before paying. Keep the order number and receipt.'
            ),
          ],
        },
        {
          id: 'usdt',
          title: t('Pay with USDT'),
          steps: [
            t(
              'If USDT is offered, use only the network, token, receiving address, and exact amount displayed on the current order.'
            ),
            t(
              'For a TRON order, send USDT on TRON (TRC20). Check the withdrawal network and allow for any exchange withdrawal fee so the received amount matches the order.'
            ),
            t(
              'Send before the order expires. Keep the transaction hash and wait for the required chain confirmations and order update.'
            ),
          ],
          note: t(
            'Do not reuse an address from an old order or another website. Other tokens and networks, including USDC, are not supported unless the current checkout explicitly offers them.'
          ),
        },
        {
          id: 'payment-not-credited',
          title: t('Payment not credited'),
          paragraphs: [
            t(
              'Check whether the order is paid or expired and whether an on-chain transfer has confirmed. If it remains unresolved, contact the support channel published by this site with the order number, payment time, amount, and receipt or transaction hash. Do not pay the same order again while it is being investigated.'
            ),
          ],
          links: [{ label: t('Security and support'), article: 'support' }],
        },
      ],
    },
    {
      id: 'usage',
      group: t('Billing and recharge'),
      title: t('Usage and orders'),
      description: t(
        'Match requests and payments to the records in your console.'
      ),
      sections: [
        {
          id: 'request-records',
          title: t('Inspect request usage'),
          paragraphs: [
            t(
              'In Usage Logs, filter by time, model, or key to find a request. Check its status, token usage, latency, and charge where available. Record the request ID when reporting an issue.'
            ),
          ],
          links: [{ label: t('Usage Logs'), to: '/usage-logs' }],
        },
        {
          id: 'wallet-records',
          title: t('Inspect recharge orders'),
          paragraphs: [
            t(
              'In Wallet, check your recharge order status and credited balance. A payment receipt or blockchain transfer alone does not confirm that the platform order has been credited.'
            ),
          ],
          links: [{ label: t('Wallet'), to: '/wallet' }],
        },
      ],
    },
    {
      id: 'troubleshooting',
      group: t('Help and support'),
      title: t('Troubleshooting'),
      description: t(
        'Start with the HTTP status, then check the address, key, and model.'
      ),
      sections: [
        {
          id: 'http-errors',
          title: t('Common request errors'),
          table: {
            headers: [t('Symptom'), t('What to check')],
            rows: [
              [
                '400',
                t(
                  'Check the JSON body, required parameters, and model endpoint compatibility.'
                ),
              ],
              [
                '401',
                t(
                  'Check that you are using an active API key with the expected authentication header, without extra spaces.'
                ),
              ],
              [
                '402 / 403',
                t(
                  'Read the error message. Check balance, key quota, group access, expiration, and model or IP restrictions.'
                ),
              ],
              [
                '404',
                t(
                  'Check the exact model ID and request path. Remove duplicated /v1 segments and verify the endpoint is supported.'
                ),
              ],
              [
                '429',
                t(
                  'Reduce concurrency and request frequency. Use bounded retries with backoff and check your quota.'
                ),
              ],
              [
                '5xx / timeout',
                t(
                  'Check network reachability and the error message. Retry transient failures with backoff; preserve the request ID if the problem continues.'
                ),
              ],
            ],
          },
        },
        {
          id: 'isolate-problem',
          title: t('Isolate the problem'),
          steps: [
            t(
              'Copy the address and key again from API Keys, then select a currently available model.'
            ),
            t(
              'Try the minimal API example. If it works, compare the failing client URL, model, proxy, and timeout settings.'
            ),
            t(
              'If no response arrives, check DNS, HTTPS, local proxy settings, and network access. For streaming, ensure your client and proxy allow SSE.'
            ),
          ],
          links: [
            { label: t('API examples'), article: 'api-examples' },
            { label: t('Recharge guide'), article: 'recharge' },
          ],
        },
      ],
    },
    {
      id: 'faq',
      group: t('Help and support'),
      title: t('Frequently asked questions'),
      description: t('Answers to common setup and account questions.'),
      sections: [
        {
          id: 'which-address',
          title: t('Should I use the website address or the API address?'),
          paragraphs: [
            t(
              'Use the API address shown in this documentation or API Keys for model requests. Use the main website for login, account settings, and recharge. They can be different domains.'
            ),
          ],
        },
        {
          id: 'model-missing',
          title: t('Why is a model missing or unavailable?'),
          paragraphs: [
            t(
              'Check the full model ID, your key group, model restrictions, and the endpoints listed in Model Square. A model listed for another group may not be available to your key.'
            ),
          ],
        },
        {
          id: 'key-and-balance',
          title: t('Why does a request fail when my account has balance?'),
          paragraphs: [
            t(
              'The key can have its own quota, expiry, model restrictions, or IP restrictions. Check those settings and read the actual error response before recharging again.'
            ),
          ],
        },
        {
          id: 'subscriptions',
          title: t(
            'Does a ChatGPT or Claude subscription pay for these requests?'
          ),
          paragraphs: [
            t(
              'Consumer subscriptions and this site have separate accounts and billing. Requests made with this site API key follow this site balance, quota, and pricing rules.'
            ),
          ],
        },
        {
          id: 'documentation-session',
          title: t('Why does documentation use a separate console button?'),
          paragraphs: [
            t(
              'Documentation is public and uses a separate domain. Choose Back to Dashboard to return to the main site, where your existing valid session is checked. The documentation header does not determine whether your main-site session has expired.'
            ),
          ],
          links: [{ label: t('Back to Dashboard'), to: '/dashboard' }],
        },
      ],
    },
    {
      id: 'support',
      group: t('Help and support'),
      title: t('Security and support'),
      description: t(
        'Share enough detail to resolve an issue while protecting your credentials.'
      ),
      sections: [
        {
          id: 'telegram-channel',
          title: t('Telegram channel'),
          links: [{ label: '@tokenaigategpt', href: TELEGRAM_CHANNEL_URL }],
        },
        {
          id: 'support-details',
          title: t('Prepare a support request'),
          steps: [
            t(
              'Use a contact method published in the site announcements or console.'
            ),
            t(
              'Include the time and timezone, client version, model ID, request path, HTTP status, and request ID. For payments, include the order number and receipt or transaction hash.'
            ),
            t(
              'Remove API keys, Authorization headers, passwords, and personal information from screenshots and logs before sharing.'
            ),
          ],
          note: t(
            'Support does not need your wallet private key, seed phrase, password, or complete API key.'
          ),
        },
        {
          id: 'account-security',
          title: t('Secure your account'),
          paragraphs: [
            t(
              'Use a unique password and enable available account security options. Revoke exposed API keys promptly and review unexpected usage.'
            ),
          ],
          links: [
            { label: t('Security'), to: '/security' },
            { label: t('User Agreement'), to: '/user-agreement' },
            { label: t('Privacy Policy'), to: '/privacy-policy' },
          ],
        },
      ],
    },
  ]
}
