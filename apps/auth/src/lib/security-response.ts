import { getCorrelationId, securityLog } from "./security-log"

export function respondError(req: Request, status: number, publicMessage: string, fields: Record<string, unknown> = {}) {
  const correlationId = getCorrelationId(req)
  securityLog(status >= 500 ? "error" : "warn", "api_error", {
    correlationId,
    status,
    publicMessage,
    path: req.url,
    ...fields,
  })

  return Response.json(
    { error: publicMessage, correlationId },
    { status }
  )
}

