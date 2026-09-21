import * as Sentry from "@sentry/nextjs"
import { redactLogPayload } from "./log-redaction.ts"

type SecurityLogLevel = "warn" | "error" | "info"

interface SecurityLogScope {
  setTag(key: string, value: string): unknown
  setExtra(key: string, value: unknown): unknown
}

export interface SecurityLogReporter {
  withScope?: (callback: (scope: SecurityLogScope) => void) => void
  captureMessage?: (message: string, level: "error" | "warning") => unknown
}

const sentryReporter = Sentry as unknown as SecurityLogReporter

export function getCorrelationId(req: Request): string {
  // Prefer platform-provided IDs on Vercel for end-to-end traceability.
  return (
    req.headers.get("x-vercel-id") ||
    req.headers.get("x-request-id") ||
    req.headers.get("cf-ray") ||
    crypto.randomUUID()
  )
}

/**
 * Creates the security logger. The reporter parameter is injectable so tests
 * can verify the exact Sentry payload without relying on experimental module
 * mocking.
 */
export function createSecurityLogger(reporter: SecurityLogReporter = sentryReporter) {
  return function securityLog(
    level: SecurityLogLevel,
    event: string,
    fields: Record<string, unknown> = {}
  ) {
    const sanitizedFields = (redactLogPayload(fields) as Record<string, unknown>) || {}
    const payload = {
      ts: new Date().toISOString(),
      event,
      ...sanitizedFields,
    }

    const msg = JSON.stringify(payload)
    if (level === "error") console.error(msg)
    else if (level === "warn") console.warn(msg)
    else console.log(msg)

    if (level === "info" || typeof reporter.withScope !== "function") {
      return
    }

    reporter.withScope((scope) => {
      scope.setTag("category", "security")
      scope.setTag("security.event", event)

      for (const [key, value] of Object.entries(sanitizedFields)) {
        scope.setExtra(key, value)
      }

      reporter.captureMessage?.(`security:${event}`, level === "error" ? "error" : "warning")
    })
  }
}

export const securityLog = createSecurityLogger()
