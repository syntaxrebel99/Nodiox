import createMiddleware from 'next-intl/middleware';
import {routing} from '@nodiox/i18n';

export const proxy = createMiddleware(routing);
export default proxy;

export const config = {
  // Match only internationalized pathnames
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
