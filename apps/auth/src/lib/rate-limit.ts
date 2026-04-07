import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import crypto from "crypto"

// Reuse a single redis instance
export const redisClient = Redis.fromEnv()

// 1. Core Security Violations Limiter (Keep exact export for CSRF/CSP usage)
export const securityRateLimit = new Ratelimit({
  redis: redisClient,
  limiter: Ratelimit.slidingWindow(5, "10 m"),
  analytics: true,
  prefix: "@nodiox/ratelimit:security",
})

// 2. Global Safety Net
const globalRateLimit = new Ratelimit({
  redis: redisClient,
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  analytics: false,
  prefix: "@nodiox/ratelimit:global",
})

// 3. Login Tiers (Credential Stuffing Protection)
export const loginLimiters = [
  new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(5, "1 m"), // Burst
    analytics: true,
    prefix: "@nodiox/ratelimit:login:burst",
  }),
  new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(20, "15 m"), // Sustained
    analytics: true,
    prefix: "@nodiox/ratelimit:login:sustained",
  }),
]

// 4. OTP Request Tiers (Cost Abuse Protection)
export const otpSendLimiters = [
  new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(3, "10 m"), 
    analytics: true,
    prefix: "@nodiox/ratelimit:otp_send",
  }),
  new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(10, "1 h"), 
    analytics: true,
    prefix: "@nodiox/ratelimit:otp_send_sustained",
  }),
]

// Cooldown explicitly for send (60-second minimum gap)
export const otpSendCooldownLimit = new Ratelimit({
  redis: redisClient,
  limiter: Ratelimit.slidingWindow(1, "60 s"),
  analytics: true,
  prefix: "@nodiox/ratelimit:otp_send_cooldown",
})

// 5. OTP Verification Tiers (Guessing / Brute Force Protection)
export const otpVerifyLimiters = [
  new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(5, "15 m"), 
    analytics: true,
    prefix: "@nodiox/ratelimit:otp_verify",
  }),
]

// -- Helpers --

export function normalizeIdentifier(input: string): string {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed.includes("@")) return trimmed; // It's a phone number or something else

  const [local, domain] = trimmed.split("@")
  
  if (domain === "gmail.com" || domain === "googlemail.com") {
    // Remove aliases (+) and normalize dots (.)
    const cleanLocal = local.split("+")[0].replace(/\./g, "")
    return `${cleanLocal}@gmail.com`
  }

  return `${local}@${domain}`
}

export function hashIdentifier(namespace: string, id: string): string {
  return crypto.createHash("sha256").update(`${namespace}:${id}`).digest("hex")
}

// Bounded Delay Tarpit (Max 1s delay)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Executes a Tri-Layer Rate Limit check in parallel (IP, ID, IP+ID).
 * Injects a progressive tarpit delay bounded at 1 second.
 * Throws a standard Error if rate limit exceeded.
 */
export async function enforceAuthRateLimits(options: {
  limiters: Ratelimit[],
  ip: string,
  identifier?: string,
  namespace: string
}) {
  const { limiters, ip, identifier, namespace } = options

  // 1. Global IP Check (Instant rejection if flooding)
  const { success: globalOk } = await globalRateLimit.limit(ip)
  if (!globalOk) throw new Error("Too many attempts. Please try again later.")

  // 2. Build tracking keys
  let normalizedId = ""
  let hashedId = ""
  if (identifier) {
    normalizedId = normalizeIdentifier(identifier)
    hashedId = hashIdentifier(namespace, normalizedId)
  }

  // 3. Prepare Parallel Execution Tasks
  const limitTasks: Promise<any>[] = []
  
  for (const limiter of limiters) {
    // Add Layer 1: IP
    limitTasks.push(limiter.limit(ip))
    
    // Add Layer 2 & 3 if identifier exists
    if (hashedId) {
      // Layer 2: ID
      limitTasks.push(limiter.limit(`id:${hashedId}`))
      // Layer 3: Composite IP+ID
      limitTasks.push(limiter.limit(`composite:${ip}:${hashedId}`))
    }
  }

  // 4. Await all checks simultaneously
  const results = await Promise.all(limitTasks)

  // 5. Evaluate results & extract the lowest remaining quota for progressive delay
  let lowestRemaining = 1000;
  for (const result of results) {
    if (!result.success) {
      throw new Error("Too many attempts. Please try again later.")
    }
    if (result.remaining < lowestRemaining) {
      lowestRemaining = result.remaining;
    }
  }

  // 6. Progressive Bounded Tarpit Delay
  // E.g., if quota is 5, and remaining is 2 -> (5-2)^2 * something? 
  // We don't have the explicit max limit natively off the result unless we inspect it,
  // but if remaining is getting small, we delay.
  // 150ms per consumed attempt, up to 1000ms.
  // Just use a heuristic: closer to 0 remaining = longer delay.
  if (lowestRemaining < 5) {
    // Max delay of 1000ms. If 0 remaining, 1000ms. If 4 remaining, 200ms.
    const delay = Math.min((5 - lowestRemaining) * 200, 1000)
    if (delay > 0) {
      await sleep(delay)
    }
  }
}
