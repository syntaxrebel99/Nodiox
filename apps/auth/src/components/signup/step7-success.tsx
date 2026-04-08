"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import Image from "next/image"
import { motion, useReducedMotion } from "framer-motion"
import { ShimmerButton } from "@nodiox/ui"

interface Step7SuccessProps {
  firstName: string
  alreadyRegistered?: boolean
}

import { useRouter } from "@nodiox/i18n"

export function Step7Success({ firstName, alreadyRegistered }: Step7SuccessProps) {
  const t = useTranslations("Onboarding")
  const router = useRouter()

  const shouldReduceMotion = useReducedMotion()

  const titleKey = alreadyRegistered ? "step7AlreadyRegisteredTitle" : "step7Title"
  const subtitleKey = alreadyRegistered ? "step7AlreadyRegisteredSubtitle" : "step7Subtitle"

  const motionProps = shouldReduceMotion ? {} : {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.4, ease: "easeOut" as const }
  }

  return (
    <motion.div
      {...motionProps}
      className="flex flex-col items-center justify-center gap-6 py-4"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="relative mb-2 flex h-12 w-12 items-center justify-center">
          <Image
            src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f389/512.webp"
            alt="🥳"
            width={48}
            height={48}
            unoptimized
            className="block h-12 w-12"
          />
        </div>
        
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {t(titleKey, { firstName })}
          </h1>
          <p className="text-sm text-muted-foreground max-w-[320px] mx-auto">
            {t(subtitleKey)}
          </p>
        </div>
      </div>

      <ShimmerButton
        className="w-full max-w-[280px]"
        onClick={() => {
          const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3002'
          window.location.href = dashboardUrl
        }}
      >
        {t("goToDashboard")}
      </ShimmerButton>
    </motion.div>
  )
}
