import { redactLogPayload } from "./log-redaction.ts"

/**
 * Structured Logger for Nodiox Auth
 * 
 * Provides consistent, JSON-formatted logs suitable for production
 * observability tools (Datadog, Sentry, CloudWatch).
 */

type LogLevel = "info" | "warn" | "error" | "debug"

interface LogContext {
  [key: string]: any
}

class Logger {
  private isProduction = process.env.NODE_ENV === "production"

  private format(level: LogLevel, event: string, data?: LogContext, error?: unknown) {
    const payload: any = {
      level,
      event,
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV,
      ...data,
    }

    if (error) {
      payload.error = error instanceof Error ? {
        message: error.message,
        stack: this.isProduction ? undefined : error.stack,
        name: error.name,
      } : String(error)
    }

    // Mask PII, credentials, DB URLs, provider URLs through centralized redaction
    return JSON.stringify(redactLogPayload(payload))
  }

  info(event: string, data?: LogContext) {
    console.log(this.format("info", event, data))
  }

  warn(event: string, data?: LogContext) {
    console.warn(this.format("warn", event, data))
  }

  error(event: string, error?: unknown, data?: LogContext) {
    console.error(this.format("error", event, data, error))
  }

  debug(event: string, data?: LogContext) {
    if (!this.isProduction) {
      console.debug(this.format("debug", event, data))
    }
  }
}

export const logger = new Logger()
