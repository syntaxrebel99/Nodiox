import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// Create a new ratelimiter that allows 5 requests per 10 minutes
export const otpRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(50, "10 m"),
  analytics: true,
  prefix: "@upstash/ratelimit",
})
