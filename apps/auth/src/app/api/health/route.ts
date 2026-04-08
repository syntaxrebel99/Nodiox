import { NextResponse } from "next/server"
import { createAdminClient } from "~/lib/supabase/admin"
import { redisClient } from "~/lib/rate-limit"
import { logger } from "~/lib/logger"

/**
 * Health Check API
 * 
 * Used by infrastructure monitors to verify the service and its 
 * dependencies are operational.
 */
export async function GET() {
  const timestamp = new Date().toISOString()
  const health: any = {
    status: "ok",
    timestamp,
    services: {
      api: "up",
      database: "unknown",
      cache: "unknown",
    }
  }

  try {
    // 1. Check Database (Supabase)
    const admin = createAdminClient()
    const { error: dbError } = await admin.from("verification_codes").select("count", { count: "exact", head: true }).limit(1)
    health.services.database = dbError ? "down" : "up"
    
    // 2. Check Cache (Upstash Redis)
    try {
      await redisClient.ping()
      health.services.cache = "up"
    } catch (e) {
      health.services.cache = "down"
    }

    const allUp = health.services.database === "up" && health.services.cache === "up"
    health.status = allUp ? "ok" : "degraded"

    if (!allUp) {
      logger.warn("health_check_degraded", { services: health.services })
    }

    return NextResponse.json(health, { status: allUp ? 200 : 503 })

  } catch (error) {
    logger.error("health_check_failed", error)
    return NextResponse.json({
      status: "error",
      timestamp,
      message: error instanceof Error ? error.message : "Unexpected failure"
    }, { status: 500 })
  }
}
