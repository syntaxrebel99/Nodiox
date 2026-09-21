import { getCorrelationId, securityLog } from "./security-log.ts"

export type AuthFailureCode =
  | "invalid_credentials"
  | "user_exists"
  | "weak_password"
  | "otp_expired"
  | "otp_invalid"
  | "otp_send_failed"
  | "mfa_required"
  | "mfa_send_failed"
  | "mfa_session_failed"
  | "rate_limit_exceeded"
  | "session_expired"
  | "validation_failed"
  | "csrf_rejected"
  | "provider_unavailable"
  | "unexpected_error"

export interface AuthTelemetry {
  failureCode?: AuthFailureCode
  provider?: "supabase" | "upstash" | "resend" | "infobip" | "internal"
  operation?: string
  identifierHash?: string
}

/**
 * Normalizes provider or system error codes/messages to finite internal telemetry codes.
 */
export function normalizeFailureCode(code?: string, rawMessage?: string): AuthFailureCode {
  const combined = `${code ?? ""} ${rawMessage ?? ""}`.toLowerCase()
  if (
    combined.includes("already registered") ||
    combined.includes("already exists") ||
    combined.includes("user_already_exists") ||
    combined.includes("email_exists")
  ) {
    return "user_exists"
  }
  if (combined.includes("weak_password") || combined.includes("password is too weak")) {
    return "weak_password"
  }
  if (
    combined.includes("invalid credentials") ||
    combined.includes("invalid_credentials") ||
    combined.includes("invalid login credentials")
  ) {
    return "invalid_credentials"
  }
  if (
    combined.includes("expired") ||
    combined.includes("token_expired") ||
    combined.includes("otp_expired")
  ) {
    return "otp_expired"
  }
  if (combined.includes("rate_limit") || combined.includes("too many")) {
    return "rate_limit_exceeded"
  }
  if (combined.includes("csrf")) {
    return "csrf_rejected"
  }
  if (
    combined.includes("network") ||
    combined.includes("fetch failed") ||
    combined.includes("econnrefused") ||
    combined.includes("timeout") ||
    combined.includes("unavailable")
  ) {
    return "provider_unavailable"
  }
  return "unexpected_error"
}

/**
 * Maps known internal/provider error codes to safe, generic public-facing messages.
 * Never discloses whether an account with an email already exists.
 */
export function mapAuthErrorCode(code?: string, rawMessage?: string): string {
  const combined = `${code ?? ""} ${rawMessage ?? ""}`.toLowerCase()
  if (
    combined.includes("already registered") ||
    combined.includes("already exists") ||
    combined.includes("user_already_exists") ||
    combined.includes("email_exists")
  ) {
    return "Unable to complete registration. Please try again."
  }
  if (combined.includes("weak_password") || combined.includes("password is too weak")) {
    return "Password does not meet security requirements"
  }
  if (
    combined.includes("invalid credentials") ||
    combined.includes("invalid_credentials") ||
    combined.includes("invalid login credentials")
  ) {
    return "Invalid email or password"
  }
  if (
    combined.includes("expired") ||
    combined.includes("token_expired") ||
    combined.includes("otp_expired")
  ) {
    return "Verification code has expired. Please request a new one."
  }
  return "Unable to complete request. Please try again."
}

/**
 * Emits a sanitized public error JSON response and records safe structured telemetry.
 * Public response contains strictly `{ error, correlationId }`.
 */
export function respondError(
  req: Request,
  status: number,
  publicMessage: string,
  telemetry: AuthTelemetry = {}
) {
  const correlationId = getCorrelationId(req)

  securityLog(status >= 500 ? "error" : "warn", "api_error", {
    correlationId,
    status,
    publicMessage,
    path: req.url,
    failureCode: telemetry.failureCode,
    provider: telemetry.provider,
    operation: telemetry.operation,
    identifierHash: telemetry.identifierHash,
  })

  return Response.json(
    { error: publicMessage, correlationId },
    { status }
  )
}
