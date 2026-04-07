import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { Providers } from "@nodiox/ui";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTimeZone } from 'next-intl/server';
import "@nodiox/ui/src/styles/globals.css";
import { CsrfProvider } from "~/components/providers/csrf-provider";
import { cookies } from "next/headers";

const ibmArabic = IBM_Plex_Sans_Arabic({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["arabic"],
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  title: "Nodiox Auth",
  description: "Sign in or create an account to access the Nodiox platform.",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const isRtl = locale === 'ar';
  const direction = isRtl ? 'rtl' : 'ltr';
  const messages = await getMessages();
  const timeZone = await getTimeZone();
  const cookieStore = await cookies();
  const csrfToken = cookieStore.get("nodiox_csrf_token")?.value || null;

  return (
    <html
      lang={locale}
      dir={direction}
      data-layout-status="active"
      className={`${GeistSans.variable} ${GeistMono.variable} ${ibmArabic.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NextIntlClientProvider messages={messages} locale={locale} timeZone={timeZone}>
          <Providers messages={messages} locale={locale} direction={direction as "ltr" | "rtl"} timeZone={timeZone}>
            <CsrfProvider token={csrfToken}>
              {children}
            </CsrfProvider>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
