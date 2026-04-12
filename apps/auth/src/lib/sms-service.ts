import crypto, { timingSafeEqual } from "crypto"

import { hashIdentifier, redisClient } from "./rate-limit"
import { securityLog } from "./security-log"
import { withRetry } from "./reliability"
import { normalizePhoneNumber } from "./phone-validation"
import { getAuthEnv } from "./env"

export type SmsOtpType = "login_mfa" | "signup"

interface StoredSmsOtp {
  expiresAt: string
  phone: string
  type: SmsOtpType
  version: "otp_hmac_sha256_v1"
  codeHash: string
  codeSalt: string
}

const SMS_OTP_TTL_SECONDS = 60 * 10
const SMS_OTP_PREFIX = "@nodiox/sms_otp"
const SMS_OTP_ATTEMPTS_PREFIX = "@nodiox/sms_otp_attempts"

function getSmsOtpKey(phone: string, type: SmsOtpType) {
  return `${SMS_OTP_PREFIX}:${hashIdentifier("sms_otp", `${type}:${phone}`)}`
}

function getSmsAttemptsKey(phone: string, type: SmsOtpType) {
  return `${SMS_OTP_ATTEMPTS_PREFIX}:${hashIdentifier("sms_otp_attempts", `${type}:${phone}`)}`
}

function getOtpPepper() {
  const { NODE_ENV, OTP_PEPPER } = getAuthEnv()
  const pepper = OTP_PEPPER
  if (NODE_ENV === "production" && (!pepper || pepper.length < 16)) {
    throw new Error("Missing/weak OTP_PEPPER in production")
  }

  return pepper ?? "dev-otp-pepper-change-me"
}

function hashOtpV1(code: string, saltB64: string) {
  return crypto
    .createHmac("sha256", getOtpPepper())
    .update(`v1:${saltB64}:${code}`)
    .digest("base64url")
}

function getInfobipConfig() {
  const env = getAuthEnv()
  const rawBaseUrl = env.INFOBIP_BASE_URL
  const apiKey = env.INFOBIP_API_KEY
  const sender = env.INFOBIP_SMS_SENDER

  if (!rawBaseUrl) {
    throw new Error("Missing INFOBIP_BASE_URL")
  }

  if (!apiKey) {
    throw new Error("Missing INFOBIP_API_KEY")
  }

  if (!sender) {
    throw new Error("Missing INFOBIP_SMS_SENDER")
  }

  const normalizedBaseUrl = rawBaseUrl.match(/^https?:\/\//i)
    ? rawBaseUrl
    : `https://${rawBaseUrl}`

  let parsedBaseUrl: URL
  try {
    parsedBaseUrl = new URL(normalizedBaseUrl)
  } catch {
    throw new Error("Invalid INFOBIP_BASE_URL")
  }

  return {
    apiKey,
    baseUrl: parsedBaseUrl.toString().replace(/\/+$/, ""),
    sender,
  }
}

function buildOtpMessage(code: string, type: SmsOtpType) {
  const context = type === "login_mfa" ? "login" : "signup"
  return `Nodiox ${context} code: ${code}. Expires in 10 minutes. If you did not request this, ignore this SMS.`
}

function getRequestErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Failed to send SMS verification code"
  }

  const data = payload as {
    messages?: Array<{ status?: { description?: string; name?: string } }>
    requestError?: {
      serviceException?: { text?: string }
      policyException?: { text?: string }
    }
  }

  return (
    data.requestError?.serviceException?.text ??
    data.requestError?.policyException?.text ??
    data.messages?.[0]?.status?.description ??
    data.messages?.[0]?.status?.name ??
    "Failed to send SMS verification code"
  )
}

export const SmsService = {
  async sendOtp(phone: string, type: SmsOtpType, locale: string = "en") {
    const normalizedPhone = normalizePhoneNumber(phone)
    const env = getAuthEnv()
    const code = env.AUTH_MOCK_SMS_CODE ?? crypto.randomInt(100000, 999999).toString()
    const codeSalt = crypto.randomBytes(16).toString("base64url")
    const codeHash = hashOtpV1(code, codeSalt)
    const expiresAt = new Date(Date.now() + SMS_OTP_TTL_SECONDS * 1000).toISOString()
    const otpKey = getSmsOtpKey(normalizedPhone, type)
    const attemptsKey = getSmsAttemptsKey(normalizedPhone, type)
    const phoneHash = hashIdentifier("phone", normalizedPhone)

    await redisClient.set(
      otpKey,
      JSON.stringify({
        expiresAt,
        phone: normalizedPhone,
        type,
        version: "otp_hmac_sha256_v1",
        codeHash,
        codeSalt,
      } satisfies StoredSmsOtp),
      { ex: SMS_OTP_TTL_SECONDS }
    )
    await redisClient.del(attemptsKey)

    if (env.AUTH_SMS_PROVIDER === "mock") {
      console.info(`[SmsService][mock] ${type} OTP for ${normalizedPhone} (${locale}): ${code}`)
      securityLog("info", "sms_otp_mocked", {
        channel: "sms",
        locale,
        phoneHash,
        type,
      })
      return { success: true }
    }

    const { apiKey, baseUrl, sender } = getInfobipConfig()

    const payload = {
      messages: [
        {
          sender,
          destinations: [{ to: normalizedPhone }],
          content: {
            text: buildOtpMessage(code, type),
          },
        },
      ],
    }

    await withRetry(
      async () => {
        const response = await fetch(`${baseUrl}/sms/3/messages`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `App ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })

        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        if (!response.ok) {
          throw new Error(getRequestErrorMessage(data))
        }
      },
      {
        onRetry: (error, attempt) => {
          securityLog("warn", "sms_send_retry", {
            attempt,
            phoneHash,
            type,
            error: error instanceof Error ? error.message : String(error),
          })
        },
      }
    )

    return { success: true }
  },

  async verifyOtp(phone: string, code: string, type: SmsOtpType) {
    const normalizedPhone = normalizePhoneNumber(phone)
    const env = getAuthEnv()
    const otpKey = getSmsOtpKey(normalizedPhone, type)
    const attemptsKey = getSmsAttemptsKey(normalizedPhone, type)
    const phoneHash = hashIdentifier("phone", normalizedPhone)

    const attempts = await redisClient.incr(attemptsKey)
    if (attempts === 1) {
      await redisClient.expire(attemptsKey, 60 * 15)
    }

    if (attempts >= 5) {
      await redisClient.del(otpKey)
      securityLog("warn", "otp_verification_failed", {
        channel: "sms",
        type,
        phoneHash,
        reason: "too_many_attempts",
      })
      return { success: false, error: "Invalid or expired verification code" }
    }

    if (env.AUTH_SMS_PROVIDER === "mock" && env.AUTH_MOCK_SMS_CODE) {
      if (!/^\d{6}$/.test(code) || code !== env.AUTH_MOCK_SMS_CODE) {
        securityLog("warn", "otp_verification_failed", {
          channel: "sms",
          type,
          phoneHash,
          reason: "mock_code_mismatch",
        })
        return { success: false, error: "Invalid or expired verification code" }
      }

      await redisClient.del(otpKey)
      await redisClient.del(attemptsKey)
      return { success: true }
    }

    const rawOtp = await redisClient.get<string | StoredSmsOtp>(otpKey)
    if (!rawOtp) {
      securityLog("warn", "otp_verification_failed", {
        channel: "sms",
        type,
        phoneHash,
        reason: "missing_code_record",
      })
      return { success: false, error: "Invalid or expired verification code" }
    }

    let storedOtp: StoredSmsOtp
    if (typeof rawOtp === "string") {
      try {
        storedOtp = JSON.parse(rawOtp) as StoredSmsOtp
      } catch {
        await redisClient.del(otpKey)
        return { success: false, error: "Invalid or expired verification code" }
      }
    } else {
      storedOtp = rawOtp
    }

    if (new Date(storedOtp.expiresAt) < new Date()) {
      await redisClient.del(otpKey)
      securityLog("warn", "otp_verification_failed", {
        channel: "sms",
        type,
        phoneHash,
        reason: "expired",
      })
      return { success: false, error: "Invalid or expired verification code" }
    }

    if (!/^\d{6}$/.test(code)) {
      securityLog("warn", "otp_verification_failed", {
        channel: "sms",
        type,
        phoneHash,
        reason: "invalid_format",
      })
      return { success: false, error: "Invalid or expired verification code" }
    }

    const expectedHash = hashOtpV1(code, storedOtp.codeSalt)
    const storedHashBuffer = Buffer.from(storedOtp.codeHash)
    const expectedHashBuffer = Buffer.from(expectedHash)
    const hashesMatch =
      storedHashBuffer.length === expectedHashBuffer.length &&
      timingSafeEqual(storedHashBuffer, expectedHashBuffer)

    if (!hashesMatch) {
      securityLog("warn", "otp_verification_failed", {
        channel: "sms",
        type,
        phoneHash,
        reason: "hash_mismatch",
      })
      return { success: false, error: "Invalid or expired verification code" }
    }

    await redisClient.del(otpKey)
    await redisClient.del(attemptsKey)

    return { success: true }
  },
}
