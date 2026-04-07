"use client"

import * as React from "react"
import { ThemeProvider } from "./theme-provider"
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl"
import { DirectionProvider } from "./ui/direction"

interface ProvidersProps {
  children: React.ReactNode
  messages: AbstractIntlMessages
  locale: string
  direction: "ltr" | "rtl"
  timeZone: string
  nonce?: string
}

export function Providers({ children, messages, locale, direction, timeZone, nonce }: ProvidersProps) {
  React.useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone) {
      document.cookie = `x-timezone=${timeZone}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      <NextIntlClientProvider messages={messages} locale={locale} timeZone={timeZone}>
        <DirectionProvider dir={direction}>
          {children}
        </DirectionProvider>
      </NextIntlClientProvider>
    </ThemeProvider>
  )
}

