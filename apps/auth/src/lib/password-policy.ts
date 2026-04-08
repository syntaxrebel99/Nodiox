export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; error: string }

const MAX_PASSWORD_LENGTH = 72

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, error: "passwordRequired" }
  }

  // 72 is a safe ceiling for bcrypt-based systems to prevent silent truncation.
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: "passwordTooLong" }
  }

  if (password.length < 8) {
    return { ok: false, error: "passwordMinLength" }
  }

  if (!/[a-z]/.test(password)) return { ok: false, error: "pwdReqLowercase" }
  if (!/[A-Z]/.test(password)) return { ok: false, error: "pwdReqUppercase" }
  if (!/[0-9]/.test(password)) return { ok: false, error: "pwdReqNumber" }
  if (!/[^A-Za-z0-9]/.test(password)) return { ok: false, error: "pwdReqSpecial" }

  return { ok: true }
}

