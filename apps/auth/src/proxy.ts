import { routing } from "@nodiox/i18n"
import createMiddleware from "next-intl/middleware"
import { NextResponse, NextRequest } from "next/server"

const intlMiddleware = createMiddleware(routing)

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Root redirect to your default page (login or dashboard)
  if (pathname === "/" || pathname === "") {
    return NextResponse.redirect(new URL(`/${routing.defaultLocale}/login`, request.url))
  }

  // 1. Generate a cryptographic nonce for this request (CSP)
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const isDev = process.env.NODE_ENV === "development"

  // 2. Build the Content-Security-Policy header
  const scriptSrc = isDev
    ? // Dev: prefer compatibility (HMR/Turbopack/inline bootstrap)
      // Keep this as tight as practical while avoiding "stuck on rendering" failures.
      `script-src 'self' 'unsafe-inline' 'unsafe-eval';`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic';`
  const cspHeader = `
    default-src 'self';
    ${scriptSrc}
    script-src-attr 'none';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    style-src-attr 'self' 'unsafe-inline';
    img-src 'self' blob: data: https://fonts.gstatic.com;
    font-src 'self' https://fonts.gstatic.com;
    connect-src 'self' https://*.supabase.co;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    frame-src 'none';
    ${!isDev ? "upgrade-insecure-requests;" : ""}
    report-uri /api/security/csp-report;
    report-to csp-endpoint;
  `
    .replace(/\s{2,}/g, " ")
    .trim()

  // 3. Set the nonce on the request headers so it's available to Server Components
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)

  // 4. Process standard routing/i18n middleware
  const response = intlMiddleware(new NextRequest(request, {
    headers: requestHeaders
  }))

  // 5. Set the CSP + nonce on the actual response sent to the browser
  response.headers.set("Content-Security-Policy", cspHeader)
  response.headers.set("x-nonce", nonce)

  // 5.1 Propagate the nonce to RSC headers (this helps with client-side navigation)
  // We use the modern NextResponse.next({ request: { headers } }) pattern if the response is a passthrough.
  // Since intlMiddleware might return a redirect, we only do this for "next" responses.
  // Note: intlMiddleware already handles its own internal routing.

  // 5.2 Set the Report-To header dynamically resolving the absolute origin
  const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`
  const cspReportUrl = `${origin}/api/security/csp-report`
  response.headers.set(
    "Report-To",
    JSON.stringify({
      group: "csp-endpoint",
      max_age: 10886400,
      endpoints: [{ url: cspReportUrl }],
    })
  )

  // Modern Reporting API (preferred by newer browsers)
  response.headers.set("Reporting-Endpoints", `csp-endpoint="${cspReportUrl}"`)

  // 6. Inject CSRF Token on first boot if missing
  if (!request.cookies.has("nodiox_csrf_token")) {
    const token = crypto.randomUUID()
    response.cookies.set("nodiox_csrf_token", token, {
      // Option C (Double Submit): must be readable by JS to echo in X-CSRF-Token.
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    })
  }

  return response
}

export default proxy

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}

