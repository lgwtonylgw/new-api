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
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { PasswordInput } from '@/components/password-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { register, wechatLoginByCode } from '@/features/auth/api'
import { LegalConsent } from '@/features/auth/components/legal-consent'
import { OAuthProviders } from '@/features/auth/components/oauth-providers'
import { registerFormSchema } from '@/features/auth/constants'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import { useEmailVerification } from '@/features/auth/hooks/use-email-verification'
import {
  getAffiliateCode,
  saveAffiliateCode,
} from '@/features/auth/lib/storage'
import { useStatus } from '@/hooks/use-status'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

export function SignUpForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [agreedToLegal, setAgreedToLegal] = useState(false)
  const [nonMainlandChinaConfirmed, setNonMainlandChinaConfirmed] =
    useState(false)
  const [wechatCode, setWeChatCode] = useState('')
  const [isWeChatDialogOpen, setIsWeChatDialogOpen] = useState(false)
  const [isWeChatSubmitting, setIsWeChatSubmitting] = useState(false)
  const legalConsentErrorMessage = t(
    'Please read and agree to the User Agreement and Privacy Policy first'
  )

  const { status } = useStatus()
  const { redirectToLogin, handleLoginResult } = useAuthRedirect()
  const {
    isSending: isSendingCode,
    secondsLeft,
    isActive,
    sendCode,
  } = useEmailVerification()

  const form = useForm<z.infer<typeof registerFormSchema>>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  const emailValue = useWatch({ control: form.control, name: 'email' })
  const emailVerificationRequired = !!status?.email_verification
  const hasUserAgreement = Boolean(status?.user_agreement_enabled)
  const hasPrivacyPolicy = Boolean(status?.privacy_policy_enabled)
  const requiresLegalConsent = hasUserAgreement || hasPrivacyPolicy
  const oauthRegisterEnabled =
    status?.oauth_register_enabled ??
    status?.data?.oauth_register_enabled ??
    true
  const hasWeChatLogin = Boolean(status?.wechat_login)
  const hasOAuthLogin =
    oauthRegisterEnabled &&
    Boolean(
      status?.wechat_login ||
      status?.github_oauth ||
      status?.oidc_enabled ||
      status?.telegram_oauth ||
      status?.discord_oauth ||
      status?.linuxdo_oauth ||
      status?.custom_oauth_providers?.length
    )
  const passwordRegisterEnabled = status?.password_register_enabled !== false
  const wechatQrCodeUrl = useMemo(() => {
    return (
      status?.wechat_qrcode ||
      status?.wechat_qr_code ||
      status?.wechat_qrcode_image_url ||
      status?.wechat_qr_code_image_url ||
      status?.wechat_account_qrcode_image_url ||
      status?.WeChatAccountQRCodeImageURL ||
      status?.data?.wechat_qrcode ||
      status?.data?.WeChatAccountQRCodeImageURL ||
      ''
    )
  }, [status])

  useEffect(() => {
    const aff = new URLSearchParams(window.location.search).get('aff')?.trim()
    if (aff) {
      saveAffiliateCode(aff)
    }
  }, [])

  async function onSubmit(data: z.infer<typeof registerFormSchema>) {
    if (!nonMainlandChinaConfirmed) {
      toast.error(
        t(
          'Please confirm that you are not a mainland China user before registering'
        )
      )
      return
    }
    if (requiresLegalConsent && !agreedToLegal) {
      toast.error(legalConsentErrorMessage)
      return
    }

    // Validate email verification if required
    if (emailVerificationRequired) {
      if (!data.email) {
        toast.error(t('Please enter your email'))
        return
      }
      if (!verificationCode) {
        toast.error(t('Please enter the verification code'))
        return
      }
    }

    setIsLoading(true)
    try {
      const res = await register({
        non_mainland_china_confirmed: nonMainlandChinaConfirmed,
        username: data.username,
        password: data.password,
        email: data.email || undefined,
        verification_code: verificationCode || undefined,
        aff_code: getAffiliateCode(),
      })

      if (res?.success) {
        toast.success(t('Account created! Please sign in'))
        redirectToLogin()
      } else {
        handleServerError(createServerError(res, t('Failed to create account')))
      }
    } catch (error) {
      handleServerError(
        AuthOperationError.from(error, t('Failed to create account'))
      )
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSendVerificationCode() {
    if (requiresLegalConsent && !agreedToLegal) {
      toast.error(legalConsentErrorMessage)
      return
    }
    const emailIsValid = await form.trigger('email')
    if (!emailIsValid) return
    await sendCode(emailValue || '')
  }

  const handleOpenWeChatDialog = () => {
    if (!validateAlternativeLogin()) return
    if (requiresLegalConsent && !agreedToLegal) {
      toast.error(legalConsentErrorMessage)
      return
    }

    setIsWeChatDialogOpen(true)
  }

  const validateAlternativeLogin = () => {
    if (!nonMainlandChinaConfirmed) {
      toast.error(
        t(
          'Please confirm that you are not a mainland China user before registering'
        )
      )
      return false
    }
    if (requiresLegalConsent && !agreedToLegal) {
      toast.error(legalConsentErrorMessage)
      return false
    }
    return true
  }

  const handleWeChatDialogChange = (open: boolean) => {
    setIsWeChatDialogOpen(open)
    if (!open) {
      setWeChatCode('')
      setIsWeChatSubmitting(false)
    }
  }

  async function handleWeChatLogin() {
    if (!validateAlternativeLogin()) return
    if (requiresLegalConsent && !agreedToLegal) {
      toast.error(legalConsentErrorMessage)
      return
    }
    if (!wechatCode.trim()) {
      toast.error(t('Please enter the verification code'))
      return
    }

    setIsWeChatSubmitting(true)
    try {
      const res = await wechatLoginByCode(wechatCode, nonMainlandChinaConfirmed)
      if (res?.success) {
        handleWeChatDialogChange(false)
        if (await handleLoginResult(res.data)) {
          toast.success(t('Signed in via WeChat'))
        }
      } else {
        handleServerError(createServerError(res, t('Login failed')))
      }
    } catch (error: unknown) {
      handleServerError(
        new AuthOperationError(t('Login failed'), undefined, { cause: error })
      )
    } finally {
      setIsWeChatSubmitting(false)
    }
  }

  let verificationCodeAction: ReactNode = t('Send code')
  if (isActive) {
    verificationCodeAction = t('Resend ({{seconds}}s)', {
      seconds: secondsLeft,
    })
  } else if (isSendingCode) {
    verificationCodeAction = <Loader2 className='h-4 w-4 animate-spin' />
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-4', className)}
        {...props}
      >
        {hasOAuthLogin && !showPasswordForm && (
          <OAuthProviders
            status={status}
            disabled={isLoading}
            onBeforeLogin={validateAlternativeLogin}
            nonMainlandChinaConfirmed={nonMainlandChinaConfirmed}
            onWeChatLogin={hasWeChatLogin ? handleOpenWeChatDialog : undefined}
            isWeChatLoading={isWeChatSubmitting}
          />
        )}
        {passwordRegisterEnabled && hasOAuthLogin && !showPasswordForm && (
          <>
            <p className='text-muted-foreground before:bg-border after:bg-border flex items-center gap-3 text-center text-xs before:h-px before:flex-1 after:h-px after:flex-1'>
              {t('Or')}
            </p>
            <Button
              type='button'
              className='w-full rounded-full'
              onClick={() => setShowPasswordForm(true)}
            >
              {t('Sign up with username')}
            </Button>
          </>
        )}
        {passwordRegisterEnabled && (showPasswordForm || !hasOAuthLogin) && (
          <>
            {/* Username Field */}
            <FormField
              control={form.control}
              name='username'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Username')}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete='username'
                      placeholder={t('Enter your username')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Password Field */}
            <FormField
              control={form.control}
              name='password'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Password')}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete='new-password'
                      placeholder={t('Enter password (8–128 characters)')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Confirm Password Field */}
            <FormField
              control={form.control}
              name='confirmPassword'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Confirm password')}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete='new-password'
                      placeholder={t('Confirm password')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email Verification Section */}
            {emailVerificationRequired && (
              <>
                {/* Email Field */}
                <FormField
                  control={form.control}
                  name='email'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('Email (required for verification)')}
                      </FormLabel>
                      <FormControl>
                        <Input
                          autoComplete='email'
                          placeholder={t('name@example.com')}
                          type='email'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Verification Code Field */}
                <div className='flex items-end gap-2'>
                  <div className='flex-1'>
                    <Input
                      aria-label={t('Verification code')}
                      autoComplete='one-time-code'
                      placeholder={t('Verification code')}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                    />
                  </div>
                  <Button
                    variant='outline'
                    type='button'
                    disabled={
                      isLoading || isSendingCode || isActive || !emailValue
                    }
                    onClick={handleSendVerificationCode}
                  >
                    {verificationCodeAction}
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        <LegalConsent
          status={status}
          checked={agreedToLegal}
          onCheckedChange={setAgreedToLegal}
          className='mt-1'
        />
        <div className='flex items-start gap-2'>
          <Checkbox
            id='registration-region-confirmation'
            checked={nonMainlandChinaConfirmed}
            onCheckedChange={(checked) =>
              setNonMainlandChinaConfirmed(checked === true)
            }
            className='mt-0.5'
          />
          <Label
            htmlFor='registration-region-confirmation'
            className='text-muted-foreground text-xs leading-5 font-normal'
          >
            {t(
              'I confirm that I am not a mainland China user and have read the service region restrictions in the User Agreement.'
            )}
          </Label>
        </div>

        {/* Submit Button */}
        {passwordRegisterEnabled && (showPasswordForm || !hasOAuthLogin) && (
          <Button
            type='submit'
            className='mt-2 w-full justify-center gap-2'
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
            {t('Create account')}
          </Button>
        )}

        {hasOAuthLogin && showPasswordForm && (
          <Button
            type='button'
            variant='outline'
            className='w-full rounded-full'
            onClick={() => setShowPasswordForm(false)}
          >
            {t('Other registration options')}
          </Button>
        )}
      </form>

      {hasWeChatLogin && (
        <Dialog
          open={isWeChatDialogOpen}
          onOpenChange={handleWeChatDialogChange}
          title={t('WeChat sign in')}
          description={t(
            'Scan the QR code to follow the official account and reply with “验证码” to receive your verification code.'
          )}
          contentClassName='sm:max-w-md'
          headerClassName='text-left'
          titleClassName='text-lg font-semibold'
          descriptionClassName='sr-only'
          contentHeight='auto'
          bodyClassName='space-y-5'
          footerClassName='border-t-0 bg-transparent pt-2'
          footer={
            <>
              <Button
                type='button'
                variant='outline'
                onClick={() => handleWeChatDialogChange(false)}
                disabled={isWeChatSubmitting}
              >
                {t('Cancel')}
              </Button>
              <Button
                type='button'
                onClick={handleWeChatLogin}
                disabled={isWeChatSubmitting}
                className='gap-2'
              >
                {isWeChatSubmitting ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : null}
                {t('Confirm')}
              </Button>
            </>
          }
        >
          {wechatQrCodeUrl ? (
            <div className='flex justify-center py-1'>
              <img
                src={wechatQrCodeUrl}
                alt={t('WeChat login QR code')}
                className='h-64 w-64 rounded-md border object-contain sm:h-[21rem] sm:w-[21rem]'
              />
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>
              {t('QR code is not configured. Please contact support.')}
            </p>
          )}
          <p className='text-muted-foreground text-center text-sm leading-6'>
            {t(
              'Scan the QR code to follow the official account and reply with “验证码” to receive your verification code.'
            )}
          </p>
          <div className='grid gap-2'>
            <Label htmlFor='wechat-code'>{t('Verification code')}</Label>
            <Input
              id='wechat-code'
              placeholder={t('Enter the verification code')}
              value={wechatCode}
              onChange={(event) => setWeChatCode(event.target.value)}
              autoComplete='one-time-code'
            />
          </div>
        </Dialog>
      )}
    </Form>
  )
}
