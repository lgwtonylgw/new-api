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

export function getApiExamplesDoc(t: TFunction, root: string): DocArticle {
  // URL literals are encoded for each target language; no live credentials are used.
  const shellRoot = `'${root.replaceAll("'", "'\\''")}'`
  return {
    id: 'api-examples',
    group: t('Integration guides'),
    title: t('API examples'),
    description: t(
      'Copy a minimal request and adapt it to your model and environment.'
    ),
    sections: [
      {
        id: 'request-preparation',
        title: t('Prepare your request'),
        paragraphs: [
          t(
            'Replace YOUR_API_KEY and YOUR_MODEL_ID before running an example. Choose a model that supports the demonstrated endpoint. The examples do not send a request from this page.'
          ),
        ],
        note: t(
          'cURL examples use Bash syntax. In PowerShell, use the dedicated example below; curl may be a shell alias on older Windows versions.'
        ),
      },
      {
        id: 'curl-chat',
        title: t('Chat Completions with cURL'),
        code: [
          {
            language: 'bash',
            title: 'Bash · cURL',
            value: `export TOKEN_AI_GATE_API_KEY="YOUR_API_KEY"\nexport TOKEN_AI_GATE_BASE_URL=${shellRoot}\n\ncurl "$TOKEN_AI_GATE_BASE_URL/v1/chat/completions" \\\n  -H "Authorization: Bearer $TOKEN_AI_GATE_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"YOUR_MODEL_ID","messages":[{"role":"user","content":"Hello"}]}'`,
          },
        ],
      },
      {
        id: 'powershell-chat',
        title: t('Chat Completions with PowerShell'),
        code: [
          {
            language: 'powershell',
            title: 'Windows · PowerShell',
            value: `$env:TOKEN_AI_GATE_API_KEY = "YOUR_API_KEY"\n$body = @{\n  model = "YOUR_MODEL_ID"\n  messages = @(@{ role = "user"; content = "Hello" })\n} | ConvertTo-Json -Depth 5\n\nInvoke-RestMethod -Method Post -Uri '${root.replaceAll("'", "''")}/v1/chat/completions' -Headers @{\n  Authorization = "Bearer $env:TOKEN_AI_GATE_API_KEY"\n} -ContentType "application/json" -Body $body`,
          },
        ],
      },
      {
        id: 'python-sdk',
        title: t('Python with the OpenAI SDK'),
        paragraphs: [
          t(
            'Install the openai package and set TOKEN_AI_GATE_API_KEY in your environment before running the Python example.'
          ),
        ],
        code: [
          {
            language: 'python',
            title: 'Python · OpenAI SDK',
            value: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    api_key=os.environ["TOKEN_AI_GATE_API_KEY"],\n    base_url=${JSON.stringify(`${root}/v1`)},\n)\nresponse = client.chat.completions.create(\n    model="YOUR_MODEL_ID",\n    messages=[{"role": "user", "content": "Hello"}],\n)\nprint(response.choices[0].message.content)`,
          },
        ],
      },
      {
        id: 'responses-api',
        title: t('Responses API with cURL'),
        code: [
          {
            language: 'bash',
            title: 'Bash · Responses',
            value: `export TOKEN_AI_GATE_API_KEY="YOUR_API_KEY"\nexport TOKEN_AI_GATE_BASE_URL=${shellRoot}\n\ncurl "$TOKEN_AI_GATE_BASE_URL/v1/responses" \\\n  -H "Authorization: Bearer $TOKEN_AI_GATE_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"YOUR_MODEL_ID","input":"Hello"}'`,
          },
        ],
        note: t(
          'For streaming, add "stream": true to the JSON body and use curl -N. Consume the stream with an SSE-capable client.'
        ),
        links: [
          { label: t('Model Square'), to: '/pricing' },
          { label: t('Troubleshooting'), article: 'troubleshooting' },
        ],
      },
    ],
  }
}
