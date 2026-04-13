export function getSentryDsn() {
  return process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || undefined
}

export function getSentryEnvironment() {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  )
}

export function isSentryEnabled() {
  return process.env.NODE_ENV !== "test" && Boolean(getSentryDsn())
}

export function getSentryTracesSampleRate() {
  return process.env.NODE_ENV === "production" ? 0.1 : 1
}
