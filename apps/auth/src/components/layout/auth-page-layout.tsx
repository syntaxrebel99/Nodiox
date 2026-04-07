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
      {/* PERF-02: Preload critical emoji assets for smooth step transitions */}
      <link rel="preload" as="image" href="https://fonts.gstatic.com/s/e/notoemoji/latest/1f9d0/512.gif" />
      <link rel="preload" as="image" href="https://fonts.gstatic.com/s/e/notoemoji/latest/1f512/512.gif" />
      <link rel="preload" as="image" href="https://fonts.gstatic.com/s/e/notoemoji/latest/1f973/512.gif" />
      
      <div className="flex flex-col gap-4 p-6 md:p-10 lg:col-span-2 dark:bg-black">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="group flex items-center gap-2 font-semibold text-xl">
            <NodioxLogo />
            Nodiox
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            {children}
          </div>
        </div>
        <div className="flex flex-col items-center gap-0 text-center text-[11px] text-muted-foreground">
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
