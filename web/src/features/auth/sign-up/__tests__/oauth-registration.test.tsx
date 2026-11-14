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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import type { OAuthRegistrationChallenge } from '@/features/auth/secure-verification/types'
import { SignUp } from '@/features/auth/sign-up'
import { api } from '@/lib/api'
import { useAuthStore, type AuthBundle } from '@/stores/auth-store'

vi.mock('@/features/auth/auth-layout', () => ({
  AuthLayout: (props: { children: React.ReactNode }) => props.children,
}))

const bundle: AuthBundle = {
  access_token: 'completed-registration',
  token_type: 'Bearer',
  access_expires_at: 9999999999,
  user: { id: 43, username: 'oauth-user', role: 1 },
  session: {
    sid: 'registration-session',
    current: true,
    login_method: 'oauth:github',
    ip: '',
    user_agent: '',
    created_at: 1,
    last_active_at: 1,
    expires_at: 9999999999,
  },
}

function PrimaryLogin(props: { challenge: OAuthRegistrationChallenge }) {
  const { handleLoginResult } = useAuthRedirect()
  return (
    <button
      type='button'
      onClick={() => void handleLoginResult(props.challenge, '/pricing')}
    >
      Authorize GitHub
    </button>
  )
}

async function openRegistration(
  overrides: Partial<OAuthRegistrationChallenge> = {}
) {
  const challenge: OAuthRegistrationChallenge = {
    require_registration: true,
    flow_token: 'registration-grant',
    expires_at: Math.floor(Date.now() / 1000) + 300,
    provider_name: 'GitHub',
    username: 'oauth-user',
    email: 'verified@example.com',
    ...overrides,
  }
  const root = createRootRoute({ component: Outlet })
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: '/primary',
      component: () => <PrimaryLogin challenge={challenge} />,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/sign-up',
      component: SignUp,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/sign-in',
      component: () => <div>Sign-in page</div>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/pricing',
      component: () => <div>Pricing destination</div>,
    }),
  ]
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/primary'] }),
  })
  render(<RouterProvider router={router} />)
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Authorize GitHub' })
  )
  await screen.findByRole('button', { name: 'Complete registration' })
  return { user, router }
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  useAuthStore.getState().auth.reset('complete')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset('idle')
})

it('shows the provider and read-only account without authenticating the pending registration', async () => {
  await openRegistration()
  expect(
    screen.getByRole('heading', { name: 'Signing you in with GitHub' })
  ).toBeVisible()
  expect(screen.getByLabelText('Email')).toHaveValue('verified@example.com')
  expect(screen.getByLabelText('Email')).toHaveAttribute('readonly')
  expect(screen.queryByLabelText('Current Password')).not.toBeInTheDocument()
  expect(useAuthStore.getState().auth.user).toBeNull()
  expect(useAuthStore.getState().auth.accessToken).toBeNull()
})

it('shows a usable username when the provider supplies no email', async () => {
  await openRegistration({ email: '' })
  expect(screen.getByLabelText('Username')).toHaveValue('oauth-user')
  expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
})

it('validates password confirmation before submitting the registration grant', async () => {
  const post = vi.spyOn(api, 'post')
  const { user } = await openRegistration()
  await user.type(
    screen.getByLabelText('Password', { exact: true }),
    'registration-password'
  )
  await user.type(
    screen.getByLabelText('Confirm password'),
    'different-password'
  )
  await user.click(
    screen.getByRole('button', { name: 'Complete registration' })
  )
  expect(await screen.findByText('Passwords do not match')).toBeVisible()
  expect(post).not.toHaveBeenCalled()
})

it('completes registration and continues to the original destination', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: bundle } })
  const { user, router } = await openRegistration()
  await user.type(
    screen.getByLabelText('Password', { exact: true }),
    'registration-password'
  )
  await user.type(
    screen.getByLabelText('Confirm password'),
    'registration-password'
  )
  await user.click(
    screen.getByRole('button', { name: 'Complete registration' })
  )
  await screen.findByText('Pricing destination')
  expect(router.state.location.pathname).toBe('/pricing')
  expect(post).toHaveBeenCalledWith(
    '/api/oauth/registration/complete',
    {
      flow_token: 'registration-grant',
      password: 'registration-password',
      confirm_password: 'registration-password',
    },
    expect.objectContaining({
      skipAuthRefresh: true,
      signal: expect.any(AbortSignal),
    })
  )
  expect(useAuthStore.getState().auth.user?.id).toBe(bundle.user.id)
  expect(useAuthStore.getState().auth.pendingOAuthRegistration).toBeNull()
})

it('aborts completion when leaving and ignores a late response', async () => {
  let resolve!: (result: unknown) => void
  const post = vi.spyOn(api, 'post').mockReturnValue(
    new Promise((done) => {
      resolve = done
    })
  )
  const { user } = await openRegistration()
  await user.type(
    screen.getByLabelText('Password', { exact: true }),
    'registration-password'
  )
  await user.type(
    screen.getByLabelText('Confirm password'),
    'registration-password'
  )
  await user.click(
    screen.getByRole('button', { name: 'Complete registration' })
  )
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  expect(
    screen.getByRole('button', { name: 'Complete registration' })
  ).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Back to sign in' }))
  await screen.findByText('Sign-in page')
  expect(post.mock.calls[0][2]?.signal?.aborted).toBe(true)
  await act(async () => resolve({ data: { success: true, data: bundle } }))
  await waitFor(() =>
    expect(useAuthStore.getState().auth.pendingOAuthRegistration).toBeNull()
  )
  expect(useAuthStore.getState().auth.user).toBeNull()
})
