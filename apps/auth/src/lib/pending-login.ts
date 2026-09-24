import { randomUUID } from "node:crypto"

import { hashIdentifier, redisClient } from "./rate-limit.ts"
import {
  parsePendingLoginChallenge,
  type PendingLoginChallengeInput,
} from "./pending-login-state.ts"

export {
  parsePendingLoginChallenge,
  type PendingEmailLoginChallenge,
  type PendingLoginChallenge,
  type PendingLoginChallengeInput,
  type PendingPhoneLoginChallenge,
} from "./pending-login-state.ts"

export const LOGIN_CHALLENGE_COOKIE = "nodiox_login_challenge"

const LOGIN_CHALLENGE_PREFIX = "@nodiox/login_challenge"
const LOGIN_CHALLENGE_TTL_SECONDS = 60 * 15

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
  challenge: PendingLoginChallengeInput
) {
  const token = randomUUID()
  const payload = {
    ...challenge,
    version: 1 as const,
    issuedAt: new Date().toISOString(),
  }

  if (!parsePendingLoginChallenge(payload)) {
    throw new Error("Invalid pending login challenge")
  }

  await redisClient.set(getChallengeKey(token), JSON.stringify(payload), {
    ex: LOGIN_CHALLENGE_TTL_SECONDS,
  })

  return token
}

export async function getPendingLoginChallenge(token: string) {
  const rawChallenge = await redisClient.get<unknown>(getChallengeKey(token))

  if (!rawChallenge) {
    return null
  }

  try {
    const parsed =
      typeof rawChallenge === "string"
        ? JSON.parse(rawChallenge)
        : rawChallenge

    return parsePendingLoginChallenge(parsed)
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
