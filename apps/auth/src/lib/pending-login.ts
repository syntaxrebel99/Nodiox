import { randomUUID } from "node:crypto"

import { hashIdentifier, redisClient } from "./rate-limit"

export const LOGIN_CHALLENGE_COOKIE = "nodiox_login_challenge"

const LOGIN_CHALLENGE_PREFIX = "@nodiox/login_challenge"
const LOGIN_CHALLENGE_TTL_SECONDS = 60 * 15

export interface PendingLoginChallenge {
  method: "email" | "phone"
  email?: string
  phone?: string
  issuedAt: string
}

function getChallengeKey(token: string) {
  return `${LOGIN_CHALLENGE_PREFIX}:${hashIdentifier("login_challenge", token)}`
}

export function getLoginChallengeCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: LOGIN_CHALLENGE_TTL_SECONDS,
  }
}

export async function issuePendingLoginChallenge(
  challenge: Omit<PendingLoginChallenge, "issuedAt">
) {
  const token = randomUUID()
  const payload: PendingLoginChallenge = {
    ...challenge,
    issuedAt: new Date().toISOString(),
  }

  await redisClient.set(getChallengeKey(token), JSON.stringify(payload), {
    ex: LOGIN_CHALLENGE_TTL_SECONDS,
  })

  return token
}

export async function getPendingLoginChallenge(token: string) {
  const rawChallenge = await redisClient.get<string>(getChallengeKey(token))

  if (typeof rawChallenge !== "string") {
    return null
  }

  try {
    const parsed = JSON.parse(rawChallenge) as PendingLoginChallenge

    if (parsed.method !== "email" && parsed.method !== "phone") {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export async function invalidatePendingLoginChallenge(token: string) {
  await redisClient.del(getChallengeKey(token))
}

export async function consumePendingLoginChallenge(token: string) {
  const challenge = await getPendingLoginChallenge(token)

  if (!challenge) {
    return null
  }

  await invalidatePendingLoginChallenge(token)
  return challenge
}
