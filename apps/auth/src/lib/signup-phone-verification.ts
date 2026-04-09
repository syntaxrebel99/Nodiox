import { randomUUID } from "node:crypto"

import { hashIdentifier, redisClient } from "./rate-limit"

export const SIGNUP_PHONE_VERIFICATION_COOKIE = "nodiox_signup_phone_token"

const SIGNUP_PHONE_VERIFICATION_PREFIX = "@nodiox/signup_phone_token"
const SIGNUP_PHONE_VERIFICATION_TTL_SECONDS = 60 * 15

function getSignupPhoneKey(token: string) {
  return `${SIGNUP_PHONE_VERIFICATION_PREFIX}:${hashIdentifier("signup_phone_token", token)}`
}

export function getSignupPhoneCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SIGNUP_PHONE_VERIFICATION_TTL_SECONDS,
  }
}

export async function issueVerifiedSignupPhoneToken(phone: string) {
  const token = randomUUID()

  await redisClient.set(getSignupPhoneKey(token), phone, {
    ex: SIGNUP_PHONE_VERIFICATION_TTL_SECONDS,
  })

  return token
}

export async function getVerifiedSignupPhone(token: string) {
  return await redisClient.get<string>(getSignupPhoneKey(token))
}

export async function invalidateVerifiedSignupPhone(token: string) {
  await redisClient.del(getSignupPhoneKey(token))
}

export async function consumeVerifiedSignupPhone(token: string) {
  const phone = await getVerifiedSignupPhone(token)

  if (!phone) {
    return null
  }

  await invalidateVerifiedSignupPhone(token)
  return phone
}
