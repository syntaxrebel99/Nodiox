import { getRequestConfig } from "next-intl/server";
import { routing } from "@nodiox/i18n";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  let messages;
  try {
    switch (locale) {
      case 'ar':
        messages = (await import('../../../../packages/i18n/src/messages/ar.json')).default;
        break;
      case 'fr':
        messages = (await import('../../../../packages/i18n/src/messages/fr.json')).default;
        break;
      case 'en':
      default:
        messages = (await import('../../../../packages/i18n/src/messages/en.json')).default;
        break;
    }
  } catch (error) {
    messages = (await import('../../../../packages/i18n/src/messages/en.json')).default;
  }

  return {
    locale,
    messages
  };
});
