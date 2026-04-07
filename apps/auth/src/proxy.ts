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

  return intlMiddleware(request);
}

export default middleware;

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
