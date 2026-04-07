import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  const timeZone = 'UTC';

  let messages;
  try {
    switch (locale) {
      case 'ar':
        messages = (await import('./messages/ar.json')).default;
        break;
      case 'fr':
        messages = (await import('./messages/fr.json')).default;
        break;
      case 'en':
      default:
        messages = (await import('./messages/en.json')).default;
        break;
    }
  } catch (error) {
    console.error(`Failed to load messages for locale ${locale}:`, error);
    messages = (await import('./messages/en.json')).default;
  }

  return {
    locale,
    messages,
    timeZone
  };
});
