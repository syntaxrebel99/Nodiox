import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  getEmailOtpAttemptKey,
  type EmailOtpAttemptGeneration,
  type EmailOtpType,
} from "../../lib/email-otp-attempt-key.ts"
import {
  verifyEmailOtp,
  type EmailOtpAttemptStore,
  type EmailOtpVerificationRecord,
  type EmailOtpVerificationStore,
} from "../../lib/email-otp-verification.ts"

const EMAIL = "firstlast@gmail.com"
const TYPE: EmailOtpType = "signup"
const NOW = new Date("2026-09-23T12:00:00.000Z")

type MutableRecord = {
  -readonly [Key in keyof EmailOtpVerificationRecord]: EmailOtpVerificationRecord[Key]
}

function hashOtp(code: string, salt: string) {
  return `hmac:${salt}:${code}`
}

function createRecord(overrides: Partial<MutableRecord> = {}): MutableRecord {
  const codeSalt = overrides.codeSalt ?? "salt-a"
  const code = "123456"

  return {
    id: "credential-row",
    email: EMAIL,
    type: TYPE,
    expiresAt: "2026-09-23T12:10:00.000Z",
    codeHash: hashOtp(code, codeSalt),
    codeSalt,
    codeVersion: "otp_hmac_sha256_v1",
    consumedAt: null,
    ...overrides,
  }
}

function cloneRecord(record: EmailOtpVerificationRecord): EmailOtpVerificationRecord {
  return { ...record }
}

function generationFor(record: EmailOtpVerificationRecord): EmailOtpAttemptGeneration {
  if (!record.codeHash || !record.codeSalt || !record.codeVersion) {
    throw new Error("Test record must contain a complete credential generation")
  }

  return {
    id: record.id,
    codeHash: record.codeHash,
    codeSalt: record.codeSalt,
    codeVersion: record.codeVersion,
    expiresAt: record.expiresAt,
  }
}

class InMemoryAttempts implements EmailOtpAttemptStore {
  readonly counts = new Map<string, number>()
  readonly expirations = new Map<string, number>()

  async del(key: string) {
    this.counts.delete(key)
    this.expirations.delete(key)
    return 1
  }

  async expire(key: string, seconds: number) {
    this.expirations.set(key, seconds)
    return 1
  }

  async incr(key: string) {
    const count = (this.counts.get(key) ?? 0) + 1
    this.counts.set(key, count)
    return count
  }
}

class InMemoryOtpStore implements EmailOtpVerificationStore {
  current: MutableRecord | null
  consumeCalls = 0
  onRead?: () => Promise<void> | void

  constructor(record: MutableRecord | null) {
    this.current = record
  }

  async read(email: string, type: EmailOtpType) {
    if (!this.current || this.current.email !== email || this.current.type !== type) {
      return { error: null, record: null }
    }

    const snapshot = cloneRecord(this.current)
    await this.onRead?.()
    return { error: null, record: snapshot }
  }

  async consumeExact(record: EmailOtpVerificationRecord) {
    this.consumeCalls += 1
    const current = this.current
    const consumed = Boolean(
      current &&
      current.id === record.id &&
      current.email === record.email &&
      current.type === record.type &&
      current.codeHash === record.codeHash &&
      current.codeSalt === record.codeSalt &&
      current.codeVersion === record.codeVersion &&
      current.expiresAt === record.expiresAt &&
      current.consumedAt === null &&
      new Date(current.expiresAt).getTime() > NOW.getTime(),
    )

    if (consumed && current) {
      current.consumedAt = NOW.toISOString()
    }

    return { consumed, error: null }
  }
}

function createDependencies(store: InMemoryOtpStore, attempts = new InMemoryAttempts()) {
  return {
    attempts,
    hashOtp,
    now: () => new Date(NOW),
    store,
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe("email OTP verification interleavings", () => {
  test("only one of two concurrent verifications can consume the same credential", async () => {
    const store = new InMemoryOtpStore(createRecord())
    const attempts = new InMemoryAttempts()
    const bothSnapshotsRead = deferred()
    const releaseVerifiers = deferred()
    let reads = 0

    store.onRead = async () => {
      reads += 1
      if (reads === 2) {
        bothSnapshotsRead.resolve()
      }
      await releaseVerifiers.promise
    }

    const first = verifyEmailOtp(EMAIL, "123456", TYPE, createDependencies(store, attempts))
    const second = verifyEmailOtp(EMAIL, "123456", TYPE, createDependencies(store, attempts))

    await bothSnapshotsRead.promise
    releaseVerifiers.resolve()

    const results = await Promise.all([first, second])
    assert.equal(results.filter((result) => result.success).length, 1)
    assert.equal(store.consumeCalls, 2)
    assert.ok(store.current?.consumedAt)
  })

  test("a verifier of A cannot consume or lock an in-place resend replacement B", async () => {
    const credentialA = createRecord({
      codeSalt: "salt-a",
      expiresAt: "2026-09-23T12:10:00.000Z",
    })
    const credentialB = createRecord({
      codeSalt: "salt-b",
      expiresAt: "2026-09-23T12:20:00.000Z",
    })
    const store = new InMemoryOtpStore(credentialA)
    const attempts = new InMemoryAttempts()
    const snapshotRead = deferred()
    const releaseVerifier = deferred()

    store.onRead = async () => {
      snapshotRead.resolve()
      await releaseVerifier.promise
    }

    const verifyA = verifyEmailOtp(EMAIL, "123456", TYPE, createDependencies(store, attempts))
    await snapshotRead.promise

    // Resend B replaces the row in place after A has read its snapshot.
    store.current = credentialB
    releaseVerifier.resolve()

    const staleResult = await verifyA
    assert.equal(staleResult.success, false)
    assert.equal(store.current?.codeSalt, "salt-b")
    assert.equal(store.current?.consumedAt, null)

    const keyA = getEmailOtpAttemptKey(EMAIL, TYPE, generationFor(credentialA))
    const keyB = getEmailOtpAttemptKey(EMAIL, TYPE, generationFor(credentialB))
    assert.equal(attempts.counts.get(keyA), 1)
    assert.equal(attempts.counts.get(keyB), undefined)

    const replacementResult = await verifyEmailOtp(
      EMAIL,
      "123456",
      TYPE,
      createDependencies(store, attempts),
    )
    assert.equal(replacementResult.success, true)
  })

  test("expired and unsupported snapshots do not delete a resend replacement", async () => {
    for (const credentialA of [
      createRecord({ expiresAt: "2026-09-23T11:59:59.000Z" }),
      createRecord({ codeVersion: "legacy_hmac_v0" }),
    ]) {
      const credentialB = createRecord({ codeSalt: `salt-b-${credentialA.codeVersion}` })
      const store = new InMemoryOtpStore(credentialA)
      store.onRead = () => {
        store.current = credentialB
      }

      const result = await verifyEmailOtp(EMAIL, "123456", TYPE, createDependencies(store))
      assert.equal(result.success, false)
      assert.equal(store.current?.codeSalt, credentialB.codeSalt)
      assert.equal(store.current?.consumedAt, null)
      assert.equal(store.consumeCalls, 0)
    }
  })

  test("a stale generation reaching lockout neither deletes nor locks its resend replacement", async () => {
    const credentialA = createRecord({ codeSalt: "salt-a" })
    const credentialB = createRecord({ codeSalt: "salt-b" })
    const store = new InMemoryOtpStore(credentialA)
    const attempts = new InMemoryAttempts()
    const keyA = getEmailOtpAttemptKey(EMAIL, TYPE, generationFor(credentialA))
    const keyB = getEmailOtpAttemptKey(EMAIL, TYPE, generationFor(credentialB))
    attempts.counts.set(keyA, 4)
    store.onRead = () => {
      store.current = credentialB
    }

    const staleResult = await verifyEmailOtp(
      EMAIL,
      "123456",
      TYPE,
      createDependencies(store, attempts),
    )

    assert.equal(staleResult.success, false)
    assert.equal(store.consumeCalls, 0)
    assert.equal(store.current?.codeSalt, "salt-b")
    assert.equal(store.current?.consumedAt, null)
    assert.equal(attempts.counts.get(keyA), 5)
    assert.equal(attempts.counts.get(keyB), undefined)

    const replacementResult = await verifyEmailOtp(
      EMAIL,
      "123456",
      TYPE,
      createDependencies(store, attempts),
    )
    assert.equal(replacementResult.success, true)
  })
})
