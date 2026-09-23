/* global console, process */

import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { promisify } from "node:util"

import { createClient } from "@supabase/supabase-js"

const execFileAsync = promisify(execFile)

function parseEnvOutput(source) {
  const values = new Map()

  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/)
    if (!match) continue

    let value = match[2].trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    values.set(match[1], value)
  }

  return values
}

async function getLocalSupabaseEnvironment() {
  const invocation = process.platform === "win32"
    ? {
        command: "cmd.exe",
        args: ["/d", "/s", "/c", "pnpm exec supabase status --output env"],
      }
    : {
        command: "pnpm",
        args: ["exec", "supabase", "status", "--output", "env"],
      }

  const { stdout } = await execFileAsync(invocation.command, invocation.args, {
    cwd: process.cwd(),
  })
  const environment = parseEnvOutput(stdout)
  const apiUrl = environment.get("API_URL")
  const anonKey = environment.get("ANON_KEY")
  const serviceRoleKey = environment.get("SERVICE_ROLE_KEY")

  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Local Supabase status did not provide the required Auth test variables")
  }

  return { anonKey, apiUrl, serviceRoleKey }
}

function getEmailIdentity(user) {
  const identities = Array.isArray(user.identities) ? user.identities : []
  const emailIdentities = identities.filter((identity) => identity?.provider === "email")
  if (emailIdentities.length !== 1) {
    throw new Error("Expected exactly one linked provider=email identity after the Admin update")
  }

  const email = emailIdentities[0]?.identity_data?.email
  return typeof email === "string" ? email : null
}

async function main() {
  const { anonKey, apiUrl, serviceRoleKey } = await getLocalSupabaseEnvironment()
  const admin = createClient(apiUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const publicClient = createClient(apiUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const suffix = randomUUID().replaceAll("-", "").slice(0, 16)
  const sourceEmail = `Task.Three${suffix}+alias@googlemail.com`
  const targetEmail = `taskthree${suffix}@gmail.com`
  const password = `Task3-${suffix}!Passw0rd`
  const metadataMarker = `task3-${suffix}`
  const phoneMetadata = `+1555${Date.now().toString().slice(-10)}`
  let userId = null
  let cleanupError = null

  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: sourceEmail,
      password,
      email_confirm: true,
      user_metadata: {
        phone: phoneMetadata,
        task3MigrationMarker: metadataMarker,
      },
    })
    if (createError || !created.user) {
      throw new Error("Unable to create the local Auth migration fixture")
    }
    userId = created.user.id

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      email: targetEmail,
      email_confirm: true,
    })
    if (updateError) {
      throw new Error("Admin email update failed in the local Auth migration contract")
    }

    const { data: readBack, error: readBackError } = await admin.auth.admin.getUserById(userId)
    const updatedUser = readBack.user
    if (readBackError || !updatedUser) {
      throw new Error("Unable to read the local Auth migration fixture after update")
    }

    if (
      updatedUser.email !== targetEmail ||
      getEmailIdentity(updatedUser) !== targetEmail ||
      !updatedUser.email_confirmed_at ||
      updatedUser.user_metadata?.task3MigrationMarker !== metadataMarker ||
      updatedUser.user_metadata?.phone !== phoneMetadata
    ) {
      throw new Error("Admin email update did not preserve the required Auth identity invariants")
    }

    const { data: phoneProjection, error: phoneProjectionError } = await admin
      .from("auth_user_phone_identities")
      .select("user_id, phone, email")
      .eq("user_id", userId)
      .maybeSingle()

    if (
      phoneProjectionError ||
      !phoneProjection ||
      phoneProjection.user_id !== userId ||
      phoneProjection.phone !== phoneMetadata ||
      phoneProjection.email !== targetEmail
    ) {
      throw new Error("Admin email update did not preserve the phone identity projection")
    }

    const { data: exists, error: existsError } = await admin.rpc("check_user_exists", {
      email_input: targetEmail,
    })
    const { data: oldIdentityExists, error: oldIdentityError } = await admin.rpc(
      "check_user_exists",
      { email_input: sourceEmail },
    )
    const { data: resolvedUserId, error: lookupError } = await admin.rpc(
      "get_auth_user_id_by_canonical_email",
      { email_input: targetEmail },
    )
    const { error: anonymousEnumerationError } = await publicClient.rpc(
      "check_user_exists",
      { email_input: targetEmail },
    )

    if (
      existsError ||
      oldIdentityError ||
      lookupError ||
      exists !== true ||
      oldIdentityExists !== false ||
      resolvedUserId !== userId ||
      !anonymousEnumerationError
    ) {
      throw new Error("Canonical Auth lookup or RPC privilege contract failed")
    }

    const { data: signedIn, error: signInError } = await publicClient.auth.signInWithPassword({
      email: targetEmail,
      password,
    })
    if (signInError || signedIn.user?.id !== userId || !signedIn.session) {
      throw new Error("Password credentials did not remain usable after the Admin email update")
    }

    console.log("Local Auth email-migration contract passed.")
  } finally {
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) {
        cleanupError = new Error("Unable to remove the local Auth migration fixture")
      }
    }
  }

  if (cleanupError) {
    throw cleanupError
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Local Auth migration contract failed")
  process.exitCode = 1
})
