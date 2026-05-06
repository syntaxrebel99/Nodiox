import { routing } from "@nodiox/i18n";
import createMiddleware from "next-intl/middleware";
import { NextResponse, NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root redirect to default onboarding step 1
  if (pathname === "/" || pathname === "") {
    return NextResponse.redirect(new URL(`/${routing.defaultLocale}/onboarding`, request.url));
  }

  // 1. Generate a cryptographic nonce for this request (CSP)
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  // 2. Build the Content-Security-Policy header
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval';`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic';`;
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
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  // 3. Set the nonce on the request headers so it's available to Server Components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // 4. Process standard routing/i18n middleware
  const response = intlMiddleware(new NextRequest(request, {
    headers: requestHeaders
  }));

  // 5. Set the CSP + nonce on the actual response sent to the browser
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("x-nonce", nonce);

  return response;
}

export default proxy;

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
};
