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
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { Footer } from '../footer'

const config = vi.hoisted(() => ({ footerHtml: '' }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: React.PropsWithChildren<{ to: string }>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'Open Source': '开源项目',
        'footer.openSourceNotice': '本软件不提供担保。',
      })[key] ?? key,
  }),
}))
vi.mock('@/hooks/use-status', () => ({ useStatus: () => ({ status: null }) }))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'Token AI Gate',
    logo: '/logo.png',
    footerHtml: config.footerHtml,
    demoSiteEnabled: false,
  }),
}))

test.each(['', '<span>Token AI Gate</span>'])(
  'brand footer with custom HTML %s shows the project notice only when opened',
  (footerHtml) => {
    config.footerHtml = footerHtml
    render(<Footer />)

    const disclosure = screen.getByText('开源项目').closest('details')
    expect(disclosure).not.toBeNull()
    expect(disclosure).not.toHaveAttribute('open')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Token AI Gate')

    fireEvent.click(screen.getByText('开源项目'))

    expect(disclosure).toHaveAttribute('open')
    expect(
      screen.getByText(/Copyright \(C\) 2023–2026 QuantumNous/)
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'AGPL v3.0 License' })
    ).toHaveAttribute(
      'href',
      'https://github.com/QuantumNous/new-api/blob/main/LICENSE'
    )
  }
)
