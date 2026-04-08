"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import Image from "next/image"
import { motion } from "framer-motion"
import { ShimmerButton } from "@nodiox/ui"
import { useRouter } from "@nodiox/i18n"
import { useFormContext } from "react-hook-form"
import type { ForgotPasswordData } from "~/lib/password-schemas"

export function Step3Success() {
  const t = useTranslations("ForgotPassword")
  const router = useRouter()
  const { watch } = useFormContext<ForgotPasswordData>()
  const email = watch("email") || "your email"

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center gap-1 text-center"
    >
      <div className="relative mb-2 flex h-12 w-12 items-center justify-center">
        <Image
          src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f4e7/512.webp"
          alt="📧"
          width={48}
          height={48}
          unoptimized
          className="block h-12 w-12"
        />
      </div>
      <h1 className="text-2xl font-bold">{t("successTitle")}</h1>
      <p className="text-sm text-balance text-muted-foreground">
        {t("successSubtitle", { email })}
      </p>
      <ShimmerButton
        className="mt-4 w-full"
        onClick={() => router.push("/login")}
      >
        {t("backToLogin")}
      </ShimmerButton>
    </motion.div>
  )
}
