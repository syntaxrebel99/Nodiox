import { routing } from '@nodiox/i18n';
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root redirect to your default page (login or dashboard)
  if (pathname === '/' || pathname === '') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 1. Process standard routing/i18n middleware
  const response = intlMiddleware(request);

  // 2. Inject CSRF Token on first boot if missing
  if (!request.cookies.has("nodiox_csrf_token")) {
    const token = crypto.randomUUID();
    response.cookies.set("nodiox_csrf_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
  }

  return response;
}

export default middleware;


export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
