export const locales = ['en', 'fr', 'ar'] as const;
export const defaultLocale = 'en' as const;

import {defineRouting} from 'next-intl/routing';
import {createNavigation} from 'next-intl/navigation';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed'
});

export const {Link, redirect, usePathname, useRouter, getPathname} =
  createNavigation(routing);
