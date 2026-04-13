import * as Sentry from "@sentry/nextjs"

type SecurityLogLevel = "warn" | "error" | "info"

export function getCorrelationId(req: Request): string {
  // Prefer platform-provided IDs on Vercel for end-to-end traceability.
  return (
    req.headers.get("x-vercel-id") ||
    req.headers.get("x-request-id") ||
    req.headers.get("cf-ray") ||
    crypto.randomUUID()
  )
}

export function securityLog(
  level: SecurityLogLevel,
  event: string,
  fields: Record<string, unknown> = {}
) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...fields,
  }

  const msg = JSON.stringify(payload)
  if (level === "error") console.error(msg)
  else if (level === "warn") console.warn(msg)
  else console.log(msg)

  if (level === "info") {
    return
  }

  Sentry.withScope((scope) => {
    scope.setTag("category", "security")
    scope.setTag("security.event", event)

    for (const [key, value] of Object.entries(fields)) {
      scope.setExtra(key, value)
    }

    Sentry.captureMessage(`security:${event}`, level === "error" ? "error" : "warning")
  })
}

