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

    // Mask PII if accidentally passed
    return JSON.stringify(this.maskSensitive(payload))
  }

  private maskSensitive(obj: any): any {
    const sensitiveKeys = ["password", "token", "code", "secret", "key", "email"]
    const mask = (val: string) => {
      if (typeof val !== "string") return val
      if (val.length < 5) return "***"
      return `${val.substring(0, 2)}***${val.substring(val.length - 2)}`
    }

    const newObj = { ...obj }
    for (const key in newObj) {
      const lowerKey = key.toLowerCase()
      if (sensitiveKeys.some(s => lowerKey.includes(s)) && typeof newObj[key] === "string") {
        newObj[key] = mask(newObj[key])
      } else if (typeof newObj[key] === "object" && newObj[key] !== null) {
        newObj[key] = this.maskSensitive(newObj[key])
      }
    }
    return newObj
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
