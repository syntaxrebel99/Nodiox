import { Resend } from "resend"
import { createAdminClient } from "./supabase/admin"
import crypto from "crypto"
import { getTranslations } from "next-intl/server"
import { redisClient, hashIdentifier } from "./rate-limit"
import { securityLog } from "./security-log"
import { withRetry } from "./reliability"
import { getAuthEnv } from "./env"
import { logger } from "./logger.ts"
import { type EmailOtpType } from "./email-otp-attempt-key.ts"
import {
  verifyEmailOtp,
  type EmailOtpVerificationRecord,
} from "./email-otp-verification.ts"
import { isCanonicalEmailIdentity, normalizeEmail } from "./normalize-email.ts"

const resend = new Resend(getAuthEnv().RESEND_API_KEY)

export type OtpType = EmailOtpType

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
  _getFromAddress(type: "default" | "security" = "default") {
    const env = getAuthEnv()
    const defaultEmail = env.RESEND_FROM_EMAIL
    const securityEmail = env.RESEND_SECURITY_FROM_EMAIL || defaultEmail

    if (env.NODE_ENV === "production" && !defaultEmail) {
      throw new Error("Missing RESEND_FROM_EMAIL in production")
    }

    const fallbackEmail = "onboarding@resend.dev"
    const senderEmail = type === "security" ? (securityEmail || fallbackEmail) : (defaultEmail || fallbackEmail)
    const senderName = type === "security" ? "Nodiox Security" : "Nodiox"

    return `${senderName} <${senderEmail}>`
  },

  _otpPepper() {
    const { NODE_ENV, OTP_PEPPER } = getAuthEnv()
    const pepper = OTP_PEPPER
    if (NODE_ENV === "production" && (!pepper || pepper.length < 16)) {
      throw new Error("Missing/weak OTP_PEPPER in production")
    }
    // Dev fallback to keep local environments functional.
    return pepper ?? "dev-otp-pepper-change-me"
  },

  _hashOtpV1(code: string, saltB64: string) {
    const pepper = EmailService._otpPepper()
    return crypto
      .createHmac("sha256", pepper)
      .update(`v1:${saltB64}:${code}`)
      .digest("base64url")
  },

  hashResetTokenV1(token: string) {
    const pepper = EmailService._otpPepper()
    return crypto
      .createHmac("sha256", pepper)
      .update(`reset_v1:${token}`)
      .digest("base64url")
  },

  _getSiteUrl() {
    const { NEXT_PUBLIC_SITE_URL, NODE_ENV } = getAuthEnv()
    const url = NEXT_PUBLIC_SITE_URL
    if (!url) {
      if (NODE_ENV === "production") {
        throw new Error("Missing NEXT_PUBLIC_SITE_URL in production")
      }
      return "http://localhost:3000"
    }
    return url
  },

  /**
   * Generates, stores, and sends a 6-digit OTP via Resend.
   */
  async sendOtp(
    email: string,
    type: OtpType,
    locale: string = 'en',
    options?: { recipientEmail?: string }
  ) {
    try {
      const supabase = createAdminClient()
      const t = await getTranslations({ locale, namespace: 'Emails' })
      if (!isCanonicalEmailIdentity(email)) {
        throw new Error("Email OTP storage requires a canonical email")
      }

      const recipientEmail = options?.recipientEmail?.trim() || email
      if (!isCanonicalEmailIdentity(email) || normalizeEmail(recipientEmail) !== email) {
        throw new Error("Email OTP recipient does not match the canonical identity")
      }
      
      // 1. Generate 6-digit code
      const code = crypto.randomInt(100000, 999999).toString()
      const saltB64 = crypto.randomBytes(16).toString("base64url")
      const codeHash = EmailService._hashOtpV1(code, saltB64)
      
      // 2. Set expiry (10 minutes)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      // 3. Store only the versioned hash and the separate delivery recipient.
      // Attempt counters are generation-bound, so a replacement naturally gets
      // a fresh counter without racing a shared email/type Redis key.
      // Upsert makes resend replacement safe under the permanent unique
      // (email,type) constraint.
      const { error: dbError } = await supabase
        .from("verification_codes")
        .upsert({
          email,
          recipient_email: recipientEmail,
          code_hash: codeHash,
          code_salt: saltB64,
          code_version: "otp_hmac_sha256_v1",
          type,
          expires_at: expiresAt,
          consumed_at: null,
          attempt_count: 0,
          last_attempt_at: null,
        }, { onConflict: "email,type" })

      if (dbError) {
        logger.error("email_otp_db_store_failed", dbError)
        throw new Error("Failed to generate verification code")
      }

      // 4. Send via Resend with Retry
      const hashedEmail = hashIdentifier("email", email)
      logger.info("email_otp_send_initiated", { emailHash: hashedEmail, type, locale })
      
      const { error: resendError } = await withRetry(async () => {
        return await resend.emails.send({
          from: EmailService._getFromAddress(),
          to: recipientEmail,
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
      }, {
        onRetry: (_err, attempt) => {
          securityLog("warn", "email_send_retry", {
            attempt,
            emailHash: hashedEmail,
            type: "otp",
            failureCode: "otp_send_failed",
            provider: "resend",
          })
        }
      })

      if (resendError) {
        logger.error("email_otp_resend_error", resendError)
        throw resendError
      }

      logger.info("email_otp_send_success", { emailHash: hashedEmail })
      return { success: true }
    } catch (error) {
      logger.error("email_otp_send_failed", error, { emailHash: hashIdentifier("email", email) })
      throw error
    }
  },

  /**
   * Verifies and atomically consumes exactly the credential generation read
   * from storage. A resend updates the same row ID, so the conditional update
   * includes every credential field that identifies that generation.
   */
  async verifyOtp(email: string, code: string, type: OtpType) {
    const supabase = createAdminClient()

    return verifyEmailOtp(email, code, type, {
      attempts: {
        del: (key) => redisClient.del(key),
        expire: (key, seconds) => redisClient.expire(key, seconds),
        incr: (key) => redisClient.incr(key),
      },
      hashOtp: EmailService._hashOtpV1,
      reportFailure: (reason) => {
        securityLog("warn", "otp_verification_failed", {
          channel: "email",
          type,
          emailHash: hashIdentifier("email", email),
          reason,
        })
      },
      store: {
        async read(canonicalEmail, otpType) {
          const { data, error } = await supabase
            .from("verification_codes")
            .select("id, email, type, expires_at, code_hash, code_salt, code_version, consumed_at")
            .match({ email: canonicalEmail, type: otpType })
            .maybeSingle()

          if (!data) {
            return { error, record: null }
          }

          return {
            error,
            record: {
              id: data.id,
              email: data.email,
              type: data.type as OtpType,
              expiresAt: data.expires_at,
              codeHash: data.code_hash ?? null,
              codeSalt: data.code_salt ?? null,
              codeVersion: data.code_version ?? null,
              consumedAt: data.consumed_at ?? null,
            } satisfies EmailOtpVerificationRecord,
          }
        },
        async consumeExact(record) {
          // Expiry and consumed_at must be evaluated by PostgreSQL in the
          // same conditional UPDATE. A server-side timestamp captured before
          // this request could otherwise allow a code after it expires while
          // waiting for the database.
          const { data, error } = await supabase.rpc("consume_email_otp", {
            p_code_hash: record.codeHash,
            p_code_salt: record.codeSalt,
            p_code_version: record.codeVersion,
            p_email: record.email,
            p_expires_at: record.expiresAt,
            p_id: record.id,
            p_type: record.type,
          })

          return { consumed: data === true, error }
        },
      },
    })
  },

  /**
   * Sends a security alert after a successful password change.
   */
  async sendPasswordChangedAlert(email: string, locale: string = 'en') {
    try {
      const t = await getTranslations({ locale, namespace: 'Emails' })
      const hashedEmail = hashIdentifier("email", email)
      logger.info("email_password_alert_initiated", { emailHash: hashedEmail, locale })

      const { error: resendError } = await withRetry(async () => {
        return await resend.emails.send({
          from: EmailService._getFromAddress("security"),
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
      }, {
        onRetry: (_err, attempt) => {
          securityLog("warn", "email_send_retry", {
            attempt,
            emailHash: hashedEmail,
            type: "password_alert",
            failureCode: "provider_unavailable",
            provider: "resend",
          })
        }
      })

      if (resendError) {
        logger.error("email_password_alert_resend_error", resendError)
        throw resendError
      }
      logger.info("email_password_alert_sent", { emailHash: hashedEmail })
    } catch (error) {
      logger.error("email_password_alert_failed", error, { emailHash: hashIdentifier("email", email) })
      throw error
    }
  },

  /**
   * Sends an alert when someone tries to signup with an existing email.
   */
  async sendSignupAttemptAlert(
    email: string,
    locale: string = 'en',
    options?: { recipientEmail?: string }
  ) {
    try {
      const t = await getTranslations({ locale, namespace: 'Emails' })
      const hashedEmail = hashIdentifier("email", email)
      const siteUrl = EmailService._getSiteUrl()
      const recipientEmail = options?.recipientEmail ?? email
      logger.info("email_signup_attempt_alert_initiated", { emailHash: hashedEmail, locale })

      const { error: resendError } = await withRetry(async () => {
        return await resend.emails.send({
          from: EmailService._getFromAddress("security"),
          to: recipientEmail,
          subject: t('signupAttemptSubject'),
          html: applyLayout(
            t('signupAttemptTitle'), 
            `
            <p>${t('otpGreeting')}</p>
            <p>${t('signupAttemptDescription')}</p>
            <p>${t('signupAttemptReason')}</p>
            <p><strong>${t('signupAttemptAction')}</strong></p>
            <div class="button-container">
              <a href="${siteUrl}/login" class="button">${t('signupAttemptButton')}</a>
            </div>
            <p>${t('commonSafe')}<br>${t('commonTeam')}</p>
            `,
            locale,
            t('securityDisclaimer'),
            t('footerNotice'),
            t('footerAddress')
          ),
        })
      }, {
        onRetry: (_err, attempt) => {
          securityLog("warn", "email_send_retry", {
            attempt,
            emailHash: hashedEmail,
            type: "signup_alert",
            failureCode: "provider_unavailable",
            provider: "resend",
          })
        }
      })

      if (resendError) {
        logger.error("email_signup_attempt_resend_error", resendError)
        throw resendError
      }
      logger.info("email_signup_attempt_sent", { emailHash: hashedEmail })
    } catch (error) {
      logger.error("email_signup_attempt_failed", error, { emailHash: hashIdentifier("email", email) })
      throw error
    }
  },

  /**
   * Sends a welcome email after successful signup.
   */
  async sendWelcomeEmail(
    email: string,
    fullName: string = 'User',
    locale: string = 'en',
    options?: { recipientEmail?: string }
  ) {
    try {
      const t = await getTranslations({ locale, namespace: 'Emails' })
      const firstName = (fullName || 'User').split(' ')[0]
      const siteUrl = EmailService._getSiteUrl()
      const recipientEmail = options?.recipientEmail ?? email
      
      const hashedEmail = hashIdentifier("email", email)
      logger.info("email_welcome_initiated", { emailHash: hashedEmail, locale })

      const { error: resendError } = await withRetry(async () => {
        return await resend.emails.send({
          from: EmailService._getFromAddress(),
          to: recipientEmail,
          subject: t('welcomeSubject', { firstName }),
          html: applyLayout(
            t('welcomeTitle', { firstName }), 
            `
            <p>${t('welcomeDescription')}</p>
            <p>${t('welcomeAction')}</p>
            <div class="button-container">
              <a href="${siteUrl}/dashboard" class="button">${t('welcomeButton')}</a>
            </div>
            <p>${t('welcomeTeam')}<br>${t('commonTeam')}</p>
            `,
            locale,
            t('securityDisclaimer'),
            t('footerNotice'),
            t('footerAddress')
          ),
        })
      }, {
        onRetry: (_err, attempt) => {
          securityLog("warn", "email_send_retry", {
            attempt,
            emailHash: hashedEmail,
            type: "welcome",
            failureCode: "provider_unavailable",
            provider: "resend",
          })
        }
      })

      if (resendError) {
        logger.error("email_welcome_resend_error", resendError)
        throw resendError
      }
      logger.info("email_welcome_sent", { emailHash: hashedEmail })
    } catch (error) {
      logger.error("email_welcome_failed", error, { emailHash: hashIdentifier("email", email) })
      throw error
    }
  }
}
