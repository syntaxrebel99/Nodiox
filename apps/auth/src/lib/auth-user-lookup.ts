import type { User } from "@supabase/supabase-js"

import { normalizePhoneNumber } from "./phone-validation"
import { createAdminClient } from "./supabase/admin"

function getUserPhoneCandidates(user: User) {
  const candidates = new Set<string>()

  if (typeof user.phone === "string" && user.phone.trim()) {
    candidates.add(normalizePhoneNumber(user.phone))
  }

  const metadataPhone = user.user_metadata?.phone
  if (typeof metadataPhone === "string" && metadataPhone.trim()) {
    candidates.add(normalizePhoneNumber(metadataPhone))
  }

  return candidates
}

export async function findAuthUserByPhone(phone: string) {
  const admin = createAdminClient()
  const normalizedPhone = normalizePhoneNumber(phone)
  const perPage = 200

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    })

    if (error) {
      throw error
    }

    const users = data.users ?? []
    const matchedUser =
      users.find((user) => getUserPhoneCandidates(user).has(normalizedPhone)) ?? null

    if (matchedUser) {
      return matchedUser
    }

    if (users.length < perPage) {
      return null
    }
  }
}
