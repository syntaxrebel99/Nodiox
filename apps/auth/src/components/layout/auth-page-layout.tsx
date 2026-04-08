import * as React from "react"
import { getTranslations } from "next-intl/server"
import { Link } from "@nodiox/i18n"
import Image from "next/image"
import { NodioxLogo } from "@nodiox/ui"
import { AuthTestimonials } from "./auth-testimonials"

interface AuthPageLayoutProps {
  children: React.ReactNode
}

export async function AuthPageLayout({ children }: AuthPageLayoutProps) {
  const t = await getTranslations("Auth")
  const year = new Date().getFullYear()

  return (
    <div className="grid min-h-svh lg:grid-cols-5 dark:bg-black">
      {/* Accessibility: Skip Navigation */}
      <a 
        href="#auth-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
      >
        Skip to content
      </a>

      {/* PERF-02: Preload critical emoji assets for smooth step transitions */}
      <link rel="preload" as="image" href="https://fonts.gstatic.com/s/e/notoemoji/latest/1f9d0/512.webp" />
      <link rel="preload" as="image" href="https://fonts.gstatic.com/s/e/notoemoji/latest/1f512/512.webp" />
      <link rel="preload" as="image" href="https://fonts.gstatic.com/s/e/notoemoji/latest/1f973/512.webp" />
      
      <div className="flex flex-col gap-4 p-6 md:p-10 lg:col-span-2 dark:bg-black">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="group flex items-center gap-2 font-semibold text-xl">
            <NodioxLogo />
            Nodiox
          </Link>
        </div>
        <main id="auth-content" className="flex flex-1 items-center justify-center outline-none" tabIndex={-1}>
          <div className="w-full max-w-xs">
            {children}
          </div>
        </main>
        <div className="flex flex-col items-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/terms" className="hover:underline hover:text-foreground">Terms</Link>
            <span>&middot;</span>
            <Link href="/privacy" className="hover:underline hover:text-foreground">Privacy</Link>
          </div>
          <p className="flex items-center gap-1">
            {t("engineeredWith")} 
            <Image 
              src="https://fonts.gstatic.com/s/e/notoemoji/latest/2764_fe0f/512.png" 
              alt="❤️" 
              width={12}
              height={12}
              className="inline-block"
            /> 
            {t("inAlgeria")}
          </p>
          <p>{t("copyright", { year })}</p>
        </div>
      </div>
      <AuthTestimonials className="lg:col-span-3" />
    </div>
  )
}
