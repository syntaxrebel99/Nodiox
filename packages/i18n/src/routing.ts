export const locales = ['en', 'fr', 'ar'] as const;
export const defaultLocale = 'en' as const;

import {defineRouting} from 'next-intl/routing';
import {createNavigation} from 'next-intl/navigation';

export const routing = defineRouting({
  locales,
  defaultLocale,
  // This repo routes as /[locale]/..., so the locale must always be present
  // to avoid treating /forgot-password as locale="forgot-password".
  localePrefix: 'always'
});

export const {Link, redirect, usePathname, useRouter, getPathname} =
  createNavigation(routing);
