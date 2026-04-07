import { NextResponse } from "next/server";
import { securityRateLimit } from "~/lib/rate-limit";

// Type-safe extraction to prevent prototype pollution or undefined logging
const safe = (v: any): string => (typeof v === "string" ? v : "unknown");

export async function POST(req: Request) {
  try {
    // 1. Production Sampling (Log only 20% of events in prod to save costs)
    if (process.env.NODE_ENV === "production" && Math.random() > 0.2) {
      return new Response(null, { status: 204 });
    }

    // 2. Strict Content-Type Handling (Allow modern & legacy Mime Types)
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("json") && !contentType.includes("csp-report")) {
      return new Response(null, { status: 204 });
    }

    // 3. Proxy-Aware IP Extraction for Rate Limiting
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1";

    // 4. Rate Limit endpoint to prevent spam/DDOS
    const { success } = await securityRateLimit.limit(`csp_report:${ip}`);
    if (!success) {
      return new Response(null, { status: 429 });
    }

    // 5. Payload Size Guard (Reject > 10KB to prevent memory exhaustion)
    const text = await req.text();
    if (text.length > 10_000) {
      console.warn(`[SECURITY] Blocked massive CSP report payload from IP: ${ip}`);
      return new Response(null, { status: 204 });
    }

    // 6. Parse JSON Safely
    const data = JSON.parse(text);

    // 7. Extract across Legacy vs Modern formats
    const report = data["csp-report"] || data.body || data;

    // 8. Log Normalized Fields
    console.log("CSP Violation Detetcted:", {
      ip,
      documentUri: safe(report["document-uri"]),
      blockedUri: safe(report["blocked-uri"]),
      violatedDirective: safe(report["violated-directive"]),
      originalPolicy: safe(report["original-policy"]),
      disposition: safe(report["disposition"]) || "enforce",
    });

  } catch (error) {
    // Swallow parse errors silently but log internally
    console.error("Invalid CSP report payload", error);
  }

  // Always return 204 No Content to the browser as per spec
  return new Response(null, { status: 204 });
}
