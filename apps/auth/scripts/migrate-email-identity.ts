import { appendFile, mkdir, readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import {
  hashEmailForReport,
  planEmailIdentityMigration,
  type AuthUserSnapshot,
  type EmailIdentityMigrationCandidate,
  verifyMigrationPrecondition,
  verifyUpdatedEmailIdentity,
} from "../src/lib/email-identity-migration.ts"

type Mode = "apply" | "dry-run"
type AdminClient = SupabaseClient

interface Options {
  journalPath: string
  mode: Mode
}

function parseOptions(argv: string[]): Options {
  let mode: Mode = "dry-run"
  let journalPath = resolve(process.cwd(), "email-identity-migration.journal.jsonl")

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--dry-run") {
      mode = "dry-run"
      continue
    }
    if (argument === "--apply") {
      mode = "apply"
      continue
    }
    if (argument === "--journal") {
      const next = argv[index + 1]
      if (!next) throw new Error("--journal requires a path")
      journalPath = resolve(next)
      index += 1
      continue
    }
    throw new Error(`Unknown option: ${argument}`)
  }

  if (
    mode === "apply" &&
    (process.env.AUTH_MIGRATION_MAINTENANCE !== "confirmed" ||
      process.env.AUTH_MIGRATION_APPLY !== "canonical-email-identity")
  ) {
    throw new Error(
      "--apply requires AUTH_MIGRATION_MAINTENANCE=confirmed and AUTH_MIGRATION_APPLY=canonical-email-identity"
    )
  }

  return { journalPath, mode }
}

async function loadLocalEnvironment() {
  const envPath = resolve(process.cwd(), ".env.local")
  try {
    const source = await readFile(envPath, "utf8")
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!match || process.env[match[1]]) continue
      const value = match[2].replace(/^(['"])(.*)\1$/, "$2")
      process.env[match[1]] = value
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

function requiredEnvironment(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required; use environment variables or apps/auth/.env.local.`)
  return value
}

async function appendJournal(path: string, event: Record<string, unknown>) {
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
}

async function listAllUsers(admin: AdminClient): Promise<AuthUserSnapshot[]> {
  const users: AuthUserSnapshot[] = []
  const perPage = 200

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error || !data || !Array.isArray(data.users)) {
      throw new Error("Unable to list Auth users.")
    }
    const pageUsers = data.users as unknown as AuthUserSnapshot[]

    // Supabase Auth versions may omit `identities` from listUsers responses
    // even though getUserById returns them.  Fetch each record before planning
    // so a missing field cannot be mistaken for a provider-email identity
    // mismatch and accidentally block or bypass the migration.
    for (const listedUser of pageUsers) {
      if (typeof listedUser.id !== "string" || listedUser.id.length === 0) {
        users.push(listedUser)
        continue
      }

      const detail = await admin.auth.admin.getUserById(listedUser.id)
      if (detail.error || !detail.data.user) {
        throw new Error(`Unable to fetch Auth user detail for ${listedUser.id}`)
      }
      users.push(detail.data.user as unknown as AuthUserSnapshot)
    }

    if (pageUsers.length < perPage) return users
  }
}

function printPlan(plan: ReturnType<typeof planEmailIdentityMigration>) {
  console.log(JSON.stringify({
    blockers: plan.blockers.map((blocker) => ({
      code: blocker.code,
      details: blocker.details,
      userIds: blocker.userIds,
    })),
    scanned: plan.scanned,
    unchanged: plan.unchanged,
    updates: plan.updates,
    warnings: plan.warnings,
  }, null, 2))
}

async function verifyPhoneIdentityProjection(
  admin: AdminClient,
  candidate: EmailIdentityMigrationCandidate
) {
  const { data, error } = await admin
    .from("auth_user_phone_identities")
    .select("user_id, email")
    .eq("user_id", candidate.id)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to verify phone identity projection for ${candidate.id}`)
  }

  if (candidate.hasPhone && !data) {
    throw new Error(`Missing phone identity projection for ${candidate.id}`)
  }

  if (data && data.email !== candidate.targetEmail) {
    throw new Error(`Phone identity projection mismatch for ${candidate.id}`)
  }
}

async function applyCandidate(
  admin: AdminClient,
  candidate: EmailIdentityMigrationCandidate,
  journalPath: string
) {
  const { data: currentData, error: currentReadError } = await admin.auth.admin.getUserById(candidate.id)
  if (currentReadError || !currentData.user) {
    await appendJournal(journalPath, {
      event: "precondition_read_failed",
      targetEmailHash: candidate.targetEmailHash,
      userId: candidate.id,
    })
    throw new Error(`Unable to read Auth user before update ${candidate.id}`)
  }

  const preconditionFailures = verifyMigrationPrecondition(
    candidate,
    currentData.user as unknown as AuthUserSnapshot,
  )
  if (preconditionFailures.length > 0) {
    await appendJournal(journalPath, {
      event: "precondition_failed",
      failures: preconditionFailures,
      targetEmailHash: candidate.targetEmailHash,
      userId: candidate.id,
    })
    throw new Error(`Migration precondition failed for ${candidate.id}: ${preconditionFailures.join(", ")}`)
  }

  await appendJournal(journalPath, {
    event: "update_started",
    targetEmailHash: candidate.targetEmailHash,
    userId: candidate.id,
  })

  const { error: updateError } = await admin.auth.admin.updateUserById(candidate.id, {
    email: candidate.targetEmail,
    email_confirm: true,
  })
  if (updateError) {
    await appendJournal(journalPath, {
      event: "update_failed",
      failure: "supabase_admin_update_failed",
      targetEmailHash: candidate.targetEmailHash,
      userId: candidate.id,
    })
    throw new Error(`Auth user update failed for ${candidate.id}`)
  }

  const { data, error: readError } = await admin.auth.admin.getUserById(candidate.id)
  if (readError || !data.user) {
    await appendJournal(journalPath, {
      event: "post_update_read_failed",
      targetEmailHash: candidate.targetEmailHash,
      userId: candidate.id,
    })
    throw new Error(`Unable to read updated Auth user ${candidate.id}`)
  }

  const failures = verifyUpdatedEmailIdentity(candidate, data.user as unknown as AuthUserSnapshot)
  if (failures.length > 0) {
    await appendJournal(journalPath, {
      event: "post_update_verification_failed",
      failures,
      targetEmailHash: candidate.targetEmailHash,
      userId: candidate.id,
    })
    throw new Error(`Post-update verification failed for ${candidate.id}: ${failures.join(", ")}`)
  }

  await verifyPhoneIdentityProjection(admin, candidate)
  await appendJournal(journalPath, {
    event: "update_verified",
    targetEmailHash: candidate.targetEmailHash,
    userId: candidate.id,
  })
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  await loadLocalEnvironment()

  const admin = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const users = await listAllUsers(admin)
  const plan = planEmailIdentityMigration(users)
  printPlan(plan)

  if (plan.blockers.length > 0) {
    process.exitCode = 2
    return
  }

  if (options.mode === "dry-run") {
    console.log("Dry run complete. No Auth user, database, Redis, or other external state was changed.")
    return
  }

  await appendJournal(options.journalPath, {
    event: "apply_started",
    scanned: plan.scanned,
    updates: plan.updates,
  })

  for (const candidate of plan.candidates) {
    if (candidate.requiresUpdate) {
      await applyCandidate(admin, candidate, options.journalPath)
    } else {
      // Makes reruns fail safely if a prior interrupted apply updated Auth but
      // left its phone projection stale. This is read-only and also covers
      // ordinary no-op development accounts.
      await verifyPhoneIdentityProjection(admin, candidate)
    }
  }

  await appendJournal(options.journalPath, {
    event: "apply_completed",
    scanned: plan.scanned,
    updates: plan.updates,
  })
  console.log(`Apply complete. Updated ${plan.updates} Auth user(s).`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown migration error"
  // The script builds its own messages from IDs and redacted hashes; provider
  // responses are never printed because they can contain raw account data.
  console.error(message.replace(/[\w.+-]+@[\w.-]+/g, (email) => hashEmailForReport(email)))
  process.exitCode = 1
})
