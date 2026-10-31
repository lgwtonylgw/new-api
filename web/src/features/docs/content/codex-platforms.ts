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

import type { DocArticle, DocSection } from '../types'
import { getCodexDoc } from './codex'
import { getCodexWindowsPermissions } from './codex-windows'

export function getCodexPlatformDocs(t: TFunction, root: string): DocArticle[] {
  const shared = getCodexDoc(t, root)
  const platforms = [
    { id: 'windows', name: 'Windows', title: t('Codex on Windows') },
    { id: 'macos', name: 'macOS', title: t('Codex on macOS') },
    { id: 'linux', name: 'Linux / WSL', title: t('Codex on Linux and WSL') },
  ] as const

  return platforms.map((platform): DocArticle => {
    const windows = platform.id === 'windows'
    const language = windows ? 'powershell' : 'bash'
    const launcher = windows ? 'codex.cmd' : 'codex'
    const editor = {
      windows: 'notepad (Join-Path $codexDir "config.toml")',
      macos: 'open -e "$codexDir/config.toml"',
      linux: 'nano "$codexDir/config.toml"',
    }[platform.id]
    const authEditor = {
      windows: 'notepad (Join-Path $codexDir "auth.json")',
      macos: 'open -e "$codexDir/auth.json"',
      linux: 'nano "$codexDir/auth.json"',
    }[platform.id]
    const files: DocSection = {
      id: 'platform-codex-files',
      title: t('Create and back up your configuration files'),
      paragraphs: [
        t(
          'Close Codex first. The commands below honor CODEX_HOME, create the user configuration directory, and back up existing config.toml and auth.json with a timestamp. Preserve unrelated settings when editing.'
        ),
        {
          windows: t(
            'Use PowerShell, not Command Prompt: $env:USERPROFILE is PowerShell syntax, while %USERPROFILE% is used in File Explorer or CMD. Press Win+R and enter %USERPROFILE%\\.codex to browse the default folder.'
          ),
          macos: t(
            'In Finder, press Command+Shift+G and enter ~/.codex to open the default folder. TextEdit must use plain text with UTF-8 encoding; turn off smart quotes for configuration files.'
          ),
          linux: t(
            'Run these commands as the Linux user who will run Codex. In WSL or SSH, edit files in that environment, not in the Windows or local computer home directory. If nano is unavailable, use another installed text editor.'
          ),
        }[platform.id],
      ],
      code: [
        {
          language,
          title: platform.name,
          value: windows
            ? `$codexDir = $env:CODEX_HOME\nif ([string]::IsNullOrWhiteSpace($codexDir)) {\n  $codexDir = Join-Path $env:USERPROFILE ".codex"\n}\nNew-Item -ItemType Directory -Path $codexDir -Force | Out-Null\n$backupStamp = Get-Date -Format "yyyyMMdd-HHmmss"\nforeach ($fileName in @("config.toml", "auth.json")) {\n  $sourcePath = Join-Path $codexDir $fileName\n  if (Test-Path -LiteralPath $sourcePath) {\n    Copy-Item -LiteralPath $sourcePath -Destination "$sourcePath.$backupStamp.bak"\n  }\n}\n${editor}`
            : `codexDir="\${CODEX_HOME:-$HOME/.codex}"\nmkdir -p "$codexDir"\nchmod 700 "$codexDir"\nbackupStamp="$(date +%Y%m%d-%H%M%S)"\nfor fileName in config.toml auth.json; do\n  if [ -f "$codexDir/$fileName" ]; then\n    cp -p "$codexDir/$fileName" "$codexDir/$fileName.$backupStamp.bak"\n    chmod 600 "$codexDir/$fileName.$backupStamp.bak"\n  fi\ndone\ntouch "$codexDir/config.toml" "$codexDir/auth.json"\nchmod 600 "$codexDir/config.toml" "$codexDir/auth.json"\n${editor}`,
        },
      ],
      note: {
        windows: t(
          'In Notepad, choose Save as type: All files and UTF-8 encoding. Enable file name extensions in Explorer and verify config.toml and auth.json were not saved with an extra .txt extension. Save the file, then close Notepad before continuing.'
        ),
        macos: t(
          'Save as plain text without adding .txt. Close the editor after saving. Never use a rich-text document for TOML or JSON.'
        ),
        linux: t(
          'In nano, press Ctrl+O, Enter, then Ctrl+X to save and exit. Keep credentials and their backups readable only by your own user.'
        ),
      }[platform.id],
    }
    const configSections = shared.sections
      .filter((section) =>
        ['codex-config', 'codex-credentials', 'codex-options'].includes(
          section.id
        )
      )
      .map((section) =>
        section.id === 'codex-credentials'
          ? {
              ...section,
              code: [
                { language, title: platform.name, value: authEditor },
                ...(section.code ?? []),
              ],
            }
          : section
      )

    return {
      id: `codex-${platform.id}`,
      group: t('Integration guides'),
      title: platform.title,
      description: t(
        'Install Codex, save your gateway settings, and verify your first request step by step.'
      ),
      sections: [
        ...shared.sections
          .filter((section) => section.id === 'codex-prepare')
          .map((section) => ({ ...section, code: undefined })),
        {
          id: 'platform-node',
          title: t('1. Install Node.js and check the terminal'),
          steps: [
            t(
              'This guide uses npm to install Codex CLI. Install the current Node.js LTS release for your operating system from the official website; npm is included. If you already use a Node version manager, keep using it.'
            ),
            windows
              ? t(
                  'Open Start, search for PowerShell, and open a normal terminal. Reopen it after installing Node.js so that PATH is refreshed. The commands in this guide are PowerShell commands.'
                )
              : t(
                  'Open Terminal and check Node.js and npm before continuing. If either command is missing, finish the Node.js installation and open a new terminal.'
                ),
          ],
          code: [
            {
              language,
              title: platform.name,
              value: windows
                ? 'node --version\nnpm.cmd --version'
                : 'node --version\nnpm --version',
            },
          ],
          links: [
            {
              label: t('Download Node.js LTS'),
              href: 'https://nodejs.org/en/download',
            },
          ],
        },
        {
          id: 'platform-install',
          title: t('2. Install and verify Codex CLI'),
          code: [
            {
              language,
              title: platform.name,
              value: windows
                ? 'npm.cmd install -g @openai/codex@latest\ncodex.cmd --version'
                : 'npm install -g @openai/codex@latest\ncodex --version',
            },
          ],
          paragraphs: [
            {
              macos: t(
                'If you already use Homebrew, brew install --cask codex is an alternative that does not require Node.js. Choose one installation method to avoid competing executable paths.'
              ),
              windows: t(
                'The .cmd suffix avoids PowerShell npm.ps1 and codex.ps1 script-policy errors. If installation still fails, use the Windows permission sections below before editing configuration.'
              ),
              linux: t(
                'Install inside your Linux or WSL terminal. For npm EACCES errors, use a Node version manager or the official standalone installer rather than sudo npm install.'
              ),
            }[platform.id],
          ],
          links: [
            {
              label: t('Official Codex documentation'),
              href: 'https://developers.openai.com/codex/cli/',
            },
          ],
        },
        ...(windows ? getCodexWindowsPermissions(t) : []),
        files,
        ...configSections,
        {
          id: 'platform-project',
          title: t('3. Open a project and start your first session'),
          steps: [
            t(
              'After saving both configuration files, open a project folder you trust. You can use the empty demo directory below for your first connection.'
            ),
            t(
              'Start Codex, review its project-trust and permission prompts, then run /status. Send a short request such as asking it to explain the current directory.'
            ),
            t(
              'Match the request time and model in this site Usage Logs. This verifies routing and billing; a local version number or displayed model name alone does not verify the gateway connection.'
            ),
          ],
          code: [
            {
              language,
              title: platform.name,
              value: windows
                ? `$demoDir = Join-Path $env:USERPROFILE "codex-demo"\nNew-Item -ItemType Directory -Path $demoDir -Force | Out-Null\nSet-Location -LiteralPath $demoDir\n${launcher} login status\n${launcher}`
                : `mkdir -p "$HOME/codex-demo"\ncd "$HOME/codex-demo"\n${launcher} login status\n${launcher}`,
            },
          ],
          note: t(
            'Enter /status inside the Codex conversation, not in PowerShell or Bash. With this gateway configuration, use your site API key; no ChatGPT subscription login is needed.'
          ),
          links: [{ label: t('Usage Logs'), to: '/usage-logs' }],
        },
        {
          id: 'platform-path',
          title: t('Check the executable, PATH, and configuration directory'),
          code: [
            {
              language,
              title: platform.name,
              value: windows
                ? 'Get-Command node,npm.cmd,codex.cmd -All | Select-Object Name,Source\n$env:CODEX_HOME'
                : 'command -v node\ncommand -v npm\ncommand -v codex\nprintf "%s\\n" "${CODEX_HOME:-$HOME/.codex}"',
            },
          ],
          paragraphs: [
            t(
              'If the command is missing or the wrong version starts, reopen the terminal and inspect the executable path. An IDE, desktop app, remote host, and WSL may use different processes and home directories. Configure the environment where Codex actually runs.'
            ),
          ],
          note: t(
            'A proxy or TLS error should be checked against your actual network settings. Do not disable certificate validation or your firewall to fix an API-key or configuration error.'
          ),
        },
        ...shared.sections.filter((section) =>
          ['codex-troubleshooting', 'codex-restore'].includes(section.id)
        ),
        {
          id: 'platform-more',
          title: t('More Codex connection options'),
          paragraphs: [
            t(
              'For environment-variable credentials and the full setting reference, return to the main Codex guide. Choose one authentication method and keep a private backup before switching.'
            ),
          ],
          links: [{ label: t('Codex setup'), article: 'codex' }],
        },
      ],
    }
  })
}
