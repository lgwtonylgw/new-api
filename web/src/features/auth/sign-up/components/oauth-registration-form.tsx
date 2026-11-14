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
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { PasswordInput } from '@/components/password-input'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { completeOAuthRegistration } from '@/features/auth/api'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import { handleServerError } from '@/lib/handle-server-error'
import { accountPasswordSchema } from '@/lib/password-policy'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'
import {
  useAuthStore,
  type PendingOAuthRegistration,
} from '@/stores/auth-store'

const registrationSchema = z
  .object({
    password: accountPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export function OAuthRegistrationForm(props: {
  pending: PendingOAuthRegistration
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { handleLoginResult } = useAuthRedirect()
  const challenge = props.pending.challenge
  const [expired, setExpired] = useState(
    challenge.expires_at * 1000 <= Date.now()
  )
  const request = useRef<AbortController | null>(null)
  const form = useForm<z.infer<typeof registrationSchema>>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const reset = form.reset

  useEffect(() => {
    const remaining = challenge.expires_at * 1000 - Date.now()
    setExpired(remaining <= 0)
    reset({ password: '', confirmPassword: '' })
    const timer = window.setTimeout(
      () => {
        setExpired(true)
        request.current?.abort()
        reset({ password: '', confirmPassword: '' })
      },
      Math.max(remaining, 0)
    )
    return () => {
      window.clearTimeout(timer)
      request.current?.abort()
      request.current = null
    }
  }, [challenge.flow_token, challenge.expires_at, reset])

  const submit = async (values: z.infer<typeof registrationSchema>) => {
    if (request.current || expired) return
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await completeOAuthRegistration(
        {
          flow_token: challenge.flow_token,
          password: values.password,
          confirm_password: values.confirmPassword,
        },
        controller.signal
      )
      if (controller.signal.aborted) return
      if (!result.success) {
        throw createServerError(result, t('Failed to create account'))
      }
      reset({ password: '', confirmPassword: '' })
      if (await handleLoginResult(result.data, props.pending.redirectTo)) {
        toast.success(t('Signed in successfully!'))
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        handleServerError(
          AuthOperationError.from(error, t('Failed to create account'))
        )
      }
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className='space-y-5'>
        <div className='space-y-2'>
          <Label htmlFor='registration-account'>
            {t(challenge.email ? 'Email' : 'Username')}
          </Label>
          <Input
            id='registration-account'
            value={challenge.email || challenge.username}
            readOnly
            autoComplete='username'
          />
          <p className='text-muted-foreground text-xs'>
            {t('Use this account and your password to sign in next time.')}
          </p>
        </div>
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Password')}</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete='new-password'
                  disabled={form.formState.isSubmitting || expired}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='confirmPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Confirm password')}</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete='new-password'
                  disabled={form.formState.isSubmitting || expired}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {expired && (
          <p role='alert' className='text-destructive text-sm'>
            {t('Login flow expired. Please sign in again.')}
          </p>
        )}
        <Button
          type='submit'
          className='w-full'
          disabled={form.formState.isSubmitting || expired}
        >
          {form.formState.isSubmitting && (
            <Loader2 className='size-4 animate-spin' />
          )}
          {t('Complete registration')}
        </Button>
        <Button
          type='button'
          variant='ghost'
          className='w-full'
          onClick={() => {
            request.current?.abort()
            form.reset({ password: '', confirmPassword: '' })
            useAuthStore.getState().auth.setPendingOAuthRegistration(null)
            void navigate({ to: '/sign-in', replace: true })
          }}
        >
          {t('Back to sign in')}
        </Button>
      </form>
    </Form>
  )
}
