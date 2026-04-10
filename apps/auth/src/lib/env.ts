import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  RESEND_FROM_EMAIL: z.string().trim().optional(),
  RESEND_SECURITY_FROM_EMAIL: z.string().trim().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().trim().optional(),
  NEXT_PUBLIC_DASHBOARD_URL: z.string().trim().optional(),
  INFOBIP_BASE_URL: z.string().trim().optional(),
  INFOBIP_API_KEY: z.string().trim().optional(),
  INFOBIP_SMS_SENDER: z.string().trim().optional(),
  OTP_PEPPER: z.string().optional(),
  COOKIE_DOMAIN: z.string().trim().optional(),
  AUTH_DISABLE_RATE_LIMITS: z.enum(["true", "false"]).optional(),
  AUTH_SMS_PROVIDER: z.enum(["infobip", "mock"]).optional(),
  AUTH_MOCK_SMS_CODE: z.string().regex(/^\d{6}$/, "AUTH_MOCK_SMS_CODE must be a 6-digit code").optional(),
})

export type AuthEnv = {
  NODE_ENV: "development" | "test" | "production"
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  UPSTASH_REDIS_REST_URL: string
  UPSTASH_REDIS_REST_TOKEN: string
  RESEND_API_KEY: string
  RESEND_FROM_EMAIL?: string
  RESEND_SECURITY_FROM_EMAIL?: string
  NEXT_PUBLIC_SITE_URL?: string
  NEXT_PUBLIC_DASHBOARD_URL?: string
  INFOBIP_BASE_URL?: string
  INFOBIP_API_KEY?: string
  INFOBIP_SMS_SENDER?: string
  OTP_PEPPER?: string
  COOKIE_DOMAIN?: string
  AUTH_DISABLE_RATE_LIMITS: boolean
  AUTH_SMS_PROVIDER: "infobip" | "mock"
  AUTH_MOCK_SMS_CODE?: string
}

let cachedEnv: AuthEnv | null = null

function formatIssues(issues: z.ZodIssue[]) {
  return issues.map((issue) => `- ${issue.message}`).join("\n")
}

export function getAuthEnv(): AuthEnv {
  if (cachedEnv) {
    return cachedEnv
  }

  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(`Invalid auth environment configuration:\n${formatIssues(parsed.error.issues)}`)
  }

  const env: AuthEnv = {
    ...parsed.data,
    RESEND_FROM_EMAIL: parsed.data.RESEND_FROM_EMAIL || undefined,
    RESEND_SECURITY_FROM_EMAIL: parsed.data.RESEND_SECURITY_FROM_EMAIL || undefined,
    NEXT_PUBLIC_SITE_URL: parsed.data.NEXT_PUBLIC_SITE_URL || undefined,
    NEXT_PUBLIC_DASHBOARD_URL: parsed.data.NEXT_PUBLIC_DASHBOARD_URL || undefined,
    INFOBIP_BASE_URL: parsed.data.INFOBIP_BASE_URL || undefined,
    INFOBIP_API_KEY: parsed.data.INFOBIP_API_KEY || undefined,
    INFOBIP_SMS_SENDER: parsed.data.INFOBIP_SMS_SENDER || undefined,
    OTP_PEPPER: parsed.data.OTP_PEPPER || undefined,
    COOKIE_DOMAIN: parsed.data.COOKIE_DOMAIN || undefined,
    AUTH_DISABLE_RATE_LIMITS: parsed.data.AUTH_DISABLE_RATE_LIMITS === "true",
    AUTH_SMS_PROVIDER: parsed.data.AUTH_SMS_PROVIDER ?? "infobip",
    AUTH_MOCK_SMS_CODE: parsed.data.AUTH_MOCK_SMS_CODE || undefined,
  }

  if (env.NODE_ENV === "production" && (!env.OTP_PEPPER || env.OTP_PEPPER.length < 16)) {
    throw new Error("Invalid auth environment configuration:\n- OTP_PEPPER must be at least 16 characters in production")
  }

  if (env.AUTH_SMS_PROVIDER === "infobip") {
    const missingSmsEnv = [
      ["INFOBIP_BASE_URL", env.INFOBIP_BASE_URL],
      ["INFOBIP_API_KEY", env.INFOBIP_API_KEY],
      ["INFOBIP_SMS_SENDER", env.INFOBIP_SMS_SENDER],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name)

    if (missingSmsEnv.length > 0) {
      throw new Error(
        `Invalid auth environment configuration:\n${missingSmsEnv
          .map((name) => `- ${name} is required when AUTH_SMS_PROVIDER=infobip`)
          .join("\n")}`
      )
    }
  }

  cachedEnv = env
  return env
}

