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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'

import { UserAuthForm } from './sign-in/components/user-auth-form'
import { SignUpForm } from './sign-up/components/sign-up-form'
import type { SystemStatus } from './types'

let status: SystemStatus
const { sendEmailVerificationMock } = vi.hoisted(() => ({
  sendEmailVerificationMock: vi.fn(),
}))

vi.mock('@/hooks/use-status', () => ({ useStatus: () => ({ status }) }))
vi.mock('@/features/auth/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth/api')>(
    '@/features/auth/api'
  )
  return {
    ...actual,
    sendEmailVerification: sendEmailVerificationMock,
  }
})
vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))
vi.mock('./hooks/use-auth-redirect', () => ({
  useAuthRedirect: () => ({
    handleLoginResult: vi.fn(),
    redirectToLogin: vi.fn(),
  }),
}))
vi.mock('@/lib/passkey', () => ({ isPasskeySupported: async () => false }))
vi.mock('@/components/turnstile', () => ({
  Turnstile: (props: {
    onVerify: (token: string) => void
    onExpire?: () => void
  }) => (
    <div>
      <button type='button' onClick={() => props.onVerify('verified-token')}>
        Complete human verification
      </button>
      <button type='button' onClick={props.onExpire}>
        Expire human verification
      </button>
    </div>
  ),
}))

beforeEach(() => {
  sendEmailVerificationMock.mockResolvedValue({ success: true })
  status = {
    github_oauth: true,
    github_client_id: 'github-client',
    oidc_enabled: true,
    oidc_display_name: 'Google',
    oidc_client_id: 'google-client',
    oidc_authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    wechat_login: true,
    telegram_oauth: true,
    telegram_oauth_configured: true,
    user_agreement_enabled: true,
    privacy_policy_enabled: true,
    turnstile_check: true,
    turnstile_site_key: 'site-key',
    email_verification: true,
  }
})

it('requires a fresh human verification token before sending an email code', async () => {
  const user = userEvent.setup()
  render(<SignUpForm />)

  await user.click(screen.getByRole('checkbox'))
  await user.click(
    screen.getByRole('button', { name: 'Sign up with username' })
  )
  await user.type(
    screen.getByLabelText('Email (required for verification)'),
    'user@example.com'
  )

  expect(
    screen.getByText(
      'Complete human verification before requesting an email code.'
    )
  ).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Send code' }))
  expect(sendEmailVerificationMock).not.toHaveBeenCalled()

  await user.click(
    screen.getByRole('button', { name: 'Complete human verification' })
  )
  await user.click(screen.getByRole('button', { name: 'Send code' }))

  await waitFor(() => {
    expect(sendEmailVerificationMock).toHaveBeenCalledWith(
      'user@example.com',
      'verified-token'
    )
  })
})

it.each(['login', 'register'])(
  'offers four providers and a separate username form for %s',
  async (mode) => {
    const user = userEvent.setup()
    render(mode === 'login' ? <UserAuthForm /> : <SignUpForm />)
    expect(
      screen.queryByLabelText(
        mode === 'login' ? 'Username or Email' : 'Username'
      )
    ).not.toBeInTheDocument()
    for (const provider of ['WeChat', 'GitHub', 'Google', 'Telegram']) {
      expect(
        screen.getByRole('button', { name: `Continue with ${provider}` })
      ).toBeEnabled()
    }
    if (mode === 'register') {
      expect(
        screen.getByRole('link', { name: 'User Agreement' })
      ).toHaveAttribute('href', '/user-agreement')
      expect(
        screen.getByRole('link', { name: 'Privacy Policy' })
      ).toHaveAttribute('href', '/privacy-policy')
      await user.click(screen.getByRole('checkbox'))
    } else {
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('link', { name: 'User Agreement' })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('link', { name: 'Privacy Policy' })
      ).not.toBeInTheDocument()
    }
    expect(
      screen.getByRole('button', { name: 'Continue with GitHub' })
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Complete human verification' })
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', {
        name:
          mode === 'login'
            ? 'Sign in with email or username'
            : 'Sign up with username',
      })
    )
    expect(
      screen.getByLabelText(mode === 'login' ? 'Username or Email' : 'Username')
    ).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: mode === 'login' ? 'Sign in' : 'Create account',
      })
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Continue with Google' })
    ).not.toBeInTheDocument()
    if (mode === 'register') {
      expect(screen.getByLabelText('Confirm password')).toBeVisible()
      expect(screen.getByPlaceholderText('Verification code')).toBeVisible()
      expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled()
      expect(
        screen.getByRole('button', { name: 'Complete human verification' })
      ).toBeVisible()
    } else {
      expect(
        screen.queryByRole('button', { name: 'Complete human verification' })
      ).not.toBeInTheDocument()
    }
    await user.click(
      screen.getByRole('button', {
        name:
          mode === 'login'
            ? 'Other login options'
            : 'Other registration options',
      })
    )
    expect(
      screen.getByRole('button', { name: 'Continue with GitHub' })
    ).toBeEnabled()
  }
)

it('opens alternative login without requiring legal consent', async () => {
  const user = userEvent.setup()
  render(<UserAuthForm />)
  const weChatButton = screen.getByRole('button', {
    name: 'Continue with WeChat',
  })

  await user.click(weChatButton)
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
})

it('shows username login directly when no alternative is configured', () => {
  status = { password_login_enabled: true }
  render(<UserAuthForm />)
  expect(screen.getByLabelText('Username or Email')).toBeVisible()
})

it('does not offer password registration when it is disabled', () => {
  status.password_register_enabled = false
  render(<SignUpForm />)
  expect(
    screen.queryByRole('button', { name: 'Sign up with username' })
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
})
