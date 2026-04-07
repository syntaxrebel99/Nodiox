import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// General rate limiter for OTP actions: allows 50 requests per 10 minutes (global/per-ip)
export const otpRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(50, "10 m"),
  analytics: true,
  prefix: "@nodiox/ratelimit:otp",
})

/**
 * Security Violation Limiter (Abuse Signal)
 * Used for CSRF failures, suspicious token attempts, etc.
 * Tight window: 5 violations per 10 minutes leads to rejection.
 */
export const securityRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "10 m"),
  analytics: true,
  prefix: "@nodiox/ratelimit:security",
})

