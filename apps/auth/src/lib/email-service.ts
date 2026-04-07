import { Resend } from "resend"
import { createAdminClient } from "./supabase/admin"
import crypto from "crypto"
import { getTranslations } from "next-intl/server"

const resend = new Resend(process.env.RESEND_API_KEY)

export type OtpType = "forgot_password" | "login_mfa" | "signup"

/**
 * Shared HTML Layout with Multi-language and RTL support.
 */
function applyLayout(title: string, content: string, locale: string, disclaimer: string, footer: string, address: string) {
  const isRtl = locale === 'ar';
  const direction = isRtl ? 'rtl' : 'ltr';
  const textAlign = isRtl ? 'right' : 'left';
  
  // Font Stack: Prefer IBM Plex Sans Arabic for AR, Geist for others.
  const fontStack = isRtl 
    ? "'IBM Plex Sans Arabic', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    : "'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  return `
    <!DOCTYPE html>
    <html lang="${locale}" dir="${direction}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        /* Fonts - Loaded for supported clients */
        @font-face {
          font-family: 'Geist';
          src: url('https://cdn.jsdelivr.net/npm/geist@1.0.3/dist/fonts/geist-sans/Geist-Regular.woff2') format('woff2');
          font-weight: 400;
          font-style: normal;
        }
        @font-face {
          font-family: 'IBM Plex Sans Arabic';
          src: url('https://fonts.gstatic.com/s/ibmplexsansarabic/v15/z7beR9fV_07S3_ZpWc_7I0u5T6CP6mX93qT2W5qE.woff2') format('woff2');
          font-weight: 400;
          font-style: normal;
        }

        body { font-family: ${fontStack}; line-height: 1.6; color: #111827; margin: 0; padding: 40px 20px; background-color: #f9fafb; direction: ${direction}; text-align: ${textAlign}; -webkit-font-smoothing: antialiased; }
        .container { max-width: 540px; margin: 0 auto; background: #ffffff; padding: 48px; border-radius: 20px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); }
        .logo-container { margin-bottom: 32px; text-align: ${textAlign}; }
        .logo-text { font-size: 24px; font-weight: 800; color: #111827; vertical-align: middle; margin: 0 8px; letter-spacing: -1px; }
        h1 { font-size: 22px; font-weight: 700; margin-bottom: 24px; color: #111827; letter-spacing: -0.5px; }
        p { margin-bottom: 20px; font-size: 15px; color: #4b5563; }
        .code-container { background-color: #f8fafc; padding: 32px; border-radius: 12px; text-align: center; margin: 32px 0; border: 1px solid #f1f5f9; direction: ltr; }
        .code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #020617; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .button-container { text-align: center; margin: 32px 0; }
        .button { display: inline-block; padding: 14px 32px; background-color: #0f172a; color: #ffffff !important; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; }
        .footer { font-size: 13px; color: #94a3b8; margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 24px; }
        .security-note { font-size: 13px; color: #64748b; font-style: italic; margin-top: 24px; border-radius: 8px; background-color: #f8fafc; padding: 12px; border: 1px solid #f1f5f9; }
        .alert { padding: 20px; background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 12px; color: #991b1b; margin: 24px 0; }
        .alert-title { font-weight: 700; margin-bottom: 4px; display: block; font-size: 14px; }
      </style>
    </head>
    <body style="margin: 0; padding: 40px 20px; background-color: #f9fafb; direction: ${direction}; text-align: ${textAlign}; -webkit-font-smoothing: antialiased;">
      <div class="container" dir="${direction}" style="text-align: ${textAlign};">
        <div class="logo-container" style="text-align: ${textAlign};">
          <span class="logo-text">Nodiox</span>
        </div>
        <h1 style="text-align: ${textAlign};">${title}</h1>
        <div style="text-align: ${textAlign};">
          ${content}
        </div>
        <div class="security-note" style="text-align: ${textAlign};">
          ${disclaimer}
        </div>
        <div class="footer" style="text-align: ${textAlign};">
          ${footer}<br>
          ${address}
        </div>
      </div>
    </body>
    </html>
  `
}

export const EmailService = {
  /**
   * Generates, stores, and sends a 6-digit OTP via Resend.
   */
  async sendOtp(email: string, type: OtpType, locale: string = 'en') {
    try {
      const supabase = createAdminClient()
      const t = await getTranslations({ locale, namespace: 'Emails' })
      
      // 1. Generate 6-digit code
      const code = crypto.randomInt(100000, 999999).toString()
      
      // 2. Set expiry (10 minutes)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      // 3. Delete any existing codes for this email and type
      await supabase
        .from("verification_codes")
        .delete()
        .match({ email, type })

      // 4. Store code in DB
      const { error: dbError } = await supabase
        .from("verification_codes")
        .insert({
          email,
          code,
          type,
          expires_at: expiresAt,
        })

      if (dbError) {
        console.error("[EmailService] DB Error storing OTP:", dbError)
        throw new Error("Failed to generate verification code")
      }

      // 5. Send via Resend
      console.log(`[EmailService] Sending OTP to ${email} (Type: ${type}, Locale: ${locale})`)
      const { error: resendError } = await resend.emails.send({
        from: "Nodiox <onboarding@resend.dev>",
        to: email,
        subject: t('otpSubject'),
        html: applyLayout(
          t('otpTitle'), 
          `
          <p>${t('otpGreeting')}</p>
          <p>${t('otpDescription')}</p>
          <div class="code-container">
            <span class="code">${code}</span>
          </div>
          <p>${t('otpLegal')}</p>
          <p>${t('commonSafe')}<br>${t('commonTeam')}</p>
          `,
          locale,
          t('securityDisclaimer'),
          t('footerNotice'),
          t('footerAddress')
        ),
      })

      if (resendError) {
        console.error(`[EmailService] Resend Error (OTP):`, resendError)
        throw resendError
      }

      console.log(`[EmailService] OTP sent successfully to ${email}`)
      return { success: true }
    } catch (error) {
      console.error(`[EmailService] Failed to send OTP to ${email}:`, error)
      throw error
    }
  },

  /**
   * Verifies a code and deletes it if valid.
   */
  async verifyOtp(email: string, code: string, type: OtpType) {
    const supabase = createAdminClient()
    const { data, error: dbError } = await supabase
      .from("verification_codes")
      .select("*")
      .match({ email, code, type })
      .single()

    if (dbError || !data) return { success: false, error: "Invalid or expired verification code" }

    if (new Date(data.expires_at) < new Date()) {
      await supabase.from("verification_codes").delete().eq("id", data.id)
      return { success: false, error: "Verification code has expired" }
    }

    await supabase.from("verification_codes").delete().eq("id", data.id)
    return { success: true }
  },

  /**
   * Sends a security alert after a successful password change.
   */
  async sendPasswordChangedAlert(email: string, locale: string = 'en') {
    try {
      const t = await getTranslations({ locale, namespace: 'Emails' })
      console.log(`[EmailService] Sending password changed alert to ${email} (Locale: ${locale})`)

      const { error: resendError } = await resend.emails.send({
        from: "Nodiox Security <onboarding@resend.dev>",
        to: email,
        subject: t('passwordChangedSubject'),
        html: applyLayout(
          t('passwordChangedTitle'), 
          `
          <p>${t('otpGreeting')}</p>
          <p>${t('passwordChangedDescription')}</p>
          <div class="alert">
            <span class="alert-title">${t('passwordChangedAlertTitle')}</span>
            <p style="margin: 0; font-size: 14px; color: inherit; opacity: 0.9;">
              ${t('passwordChangedAlertBody')}
            </p>
          </div>
          <p>${t('commonSafe')}<br>${t('commonTeam')}</p>
          `,
          locale,
          t('securityDisclaimer'),
          t('footerNotice'),
          t('footerAddress')
        ),
      })

      if (resendError) {
        console.error(`[EmailService] Resend Error (Password Alert):`, resendError)
        throw resendError
      }
      console.log(`[EmailService] Password changed alert sent to ${email}`)
    } catch (error) {
      console.error(`[EmailService] Failed to send password changed alert to ${email}:`, error)
      throw error
    }
  },

  /**
   * Sends an alert when someone tries to signup with an existing email.
   */
  async sendSignupAttemptAlert(email: string, locale: string = 'en') {
    try {
      const t = await getTranslations({ locale, namespace: 'Emails' })
      console.log(`[EmailService] Sending signup attempt alert to ${email} (Locale: ${locale})`)

      const { error: resendError } = await resend.emails.send({
        from: "Nodiox Security <onboarding@resend.dev>",
        to: email,
        subject: t('signupAttemptSubject'),
        html: applyLayout(
          t('signupAttemptTitle'), 
          `
          <p>${t('otpGreeting')}</p>
          <p>${t('signupAttemptDescription')}</p>
          <p>${t('signupAttemptReason')}</p>
          <p><strong>${t('signupAttemptAction')}</strong></p>
          <div class="button-container">
            <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login" class="button">${t('signupAttemptButton')}</a>
          </div>
          <p>${t('commonSafe')}<br>${t('commonTeam')}</p>
          `,
          locale,
          t('securityDisclaimer'),
          t('footerNotice'),
          t('footerAddress')
        ),
      })

      if (resendError) {
        console.error(`[EmailService] Resend Error (Signup Attempt):`, resendError)
        throw resendError
      }
      console.log(`[EmailService] Signup attempt alert sent to ${email}`)
    } catch (error) {
      console.error(`[EmailService] Failed to send signup attempt alert to ${email}:`, error)
      throw error
    }
  },

  /**
   * Sends a welcome email after successful signup.
   */
  async sendWelcomeEmail(email: string, fullName: string = 'User', locale: string = 'en') {
    try {
      const t = await getTranslations({ locale, namespace: 'Emails' })
      const firstName = (fullName || 'User').split(' ')[0]
      
      console.log(`[EmailService] Sending welcome email to ${email} (Locale: ${locale})`)

      const { error: resendError } = await resend.emails.send({
        from: "Nodiox <onboarding@resend.dev>",
        to: email,
        subject: t('welcomeSubject', { firstName }),
        html: applyLayout(
          t('welcomeTitle', { firstName }), 
          `
          <p>${t('welcomeDescription')}</p>
          <p>${t('welcomeAction')}</p>
          <div class="button-container">
            <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard" class="button">${t('welcomeButton')}</a>
          </div>
          <p>${t('welcomeTeam')}<br>${t('commonTeam')}</p>
          `,
          locale,
          t('securityDisclaimer'),
          t('footerNotice'),
          t('footerAddress')
        ),
      })

      if (resendError) {
        console.error(`[EmailService] Resend Error (Welcome):`, resendError)
        throw resendError
      }
      console.log(`[EmailService] Welcome email sent successfully to ${email}`)
    } catch (error) {
      console.error(`[EmailService] Failed to send welcome email to ${email}:`, error)
      throw error
    }
  }
}
