import * as Sentry from "@sentry/nextjs"

import {
  getSentryDsn,
  getSentryEnvironment,
  getSentryTracesSampleRate,
  isSentryEnabled,
} from "./lib/sentry-options"

Sentry.init({
  dsn: getSentryDsn(),
  enabled: isSentryEnabled(),
  environment: getSentryEnvironment(),
  tracesSampleRate: getSentryTracesSampleRate(),
  sendDefaultPii: false,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
