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

export function getCodexWindowsPermissions(t: TFunction): DocSection[] {
  return [
    {
      id: 'windows-permission-errors',
      title: t('Windows: identify the permission error'),
      table: {
        headers: [t('Symptom'), t('What to check')],
        rows: [
          [
            'npm.ps1 / codex.ps1 / PSSecurityException',
            t(
              'PowerShell blocked a script. Use npm.cmd and codex.cmd, or review the current-user execution policy below.'
            ),
          ],
          [
            'EPERM / EACCES / Access is denied',
            t(
              'The path in the error may be protected or a file may be in use. Inspect the npm prefix and use a writable user directory.'
            ),
          ],
          [
            'npm / codex: command not found',
            t(
              'Reopen the terminal after installation and check PATH. A missing command is different from a script execution-policy error.'
            ),
          ],
        ],
      },
    },
    {
      id: 'windows-execution-policy',
      title: t('Fix PowerShell script execution errors'),
      paragraphs: [
        t(
          'If PowerShell reports that npm.ps1 or codex.ps1 cannot be loaded because running scripts is disabled, first use the .cmd launchers. They do not require changing the PowerShell execution policy.'
        ),
      ],
      code: [
        {
          language: 'powershell',
          title: 'PowerShell · .cmd',
          value: 'npm.cmd install -g @openai/codex@latest\ncodex.cmd --version',
        },
        {
          language: 'powershell',
          title: 'PowerShell · CurrentUser',
          value:
            'Get-ExecutionPolicy -List\n$previousPolicy = Get-ExecutionPolicy -Scope CurrentUser\nSet-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser',
        },
      ],
      note: t(
        'Changing the policy is optional: record the previous CurrentUser value first, review the confirmation prompt, then retry npm or codex. CurrentUser normally needs no administrator rights; organization Group Policy can take precedence. Do not change managed policies.'
      ),
      links: [
        {
          label: t('PowerShell execution policies'),
          href: 'https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_execution_policies',
        },
      ],
    },
    {
      id: 'windows-restore-policy',
      title: t('Restore the previous execution policy'),
      paragraphs: [
        t(
          'In the same PowerShell session, restore the value saved above when you no longer need the change. In a new terminal, use the exact value you recorded, including Undefined if that was the original value.'
        ),
      ],
      code: [
        {
          language: 'powershell',
          title: 'PowerShell · CurrentUser',
          value:
            'Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy $previousPolicy',
        },
      ],
    },
    {
      id: 'windows-npm-permissions',
      title: t('Fix npm directory write permissions'),
      paragraphs: [
        t(
          'For EPERM or EACCES, inspect the failing path and close any Codex process locking the installation files. If the global npm directory is protected, install Codex into your own user directory instead:'
        ),
      ],
      code: [
        {
          language: 'powershell',
          title: 'PowerShell · npm',
          value:
            'npm.cmd config get prefix\n$npmUserDir = Join-Path $env:LOCALAPPDATA "npm-global"\nnpm.cmd install --global --prefix "$npmUserDir" @openai/codex@latest\n$env:Path = "$npmUserDir;$env:Path"\ncodex.cmd --version',
        },
      ],
      note: t(
        'Add %LOCALAPPDATA%\\npm-global to your user Path through Windows Environment Variables, then reopen the terminal. For later updates, reuse the same --prefix directory. This example does not change the global npm prefix or the machine Path.'
      ),
    },
    {
      id: 'windows-administrator',
      title: t('When administrator installation is needed'),
      steps: [
        t(
          'If you intentionally maintain a machine-wide Node.js installation in a protected directory, open Start, find Terminal or PowerShell, and choose Run as administrator.'
        ),
        t(
          'Retry only the installation command, close the elevated terminal afterward, and launch Codex from a normal terminal in your own project directory.'
        ),
      ],
      note: t(
        'Administrator rights do not fix PowerShell script policy, an invalid API key, or an unsupported model. Prefer a user-writable installation; do not run daily Codex sessions as administrator.'
      ),
    },
  ]
}
