"use client"

import * as React from "react"
import { useState } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslations } from "next-intl"
import Image from "next/image"
import { cn } from "@nodiox/utils"
import { X } from "lucide-react"
import { ShimmerButton, Input, Field, FieldLabel } from "@nodiox/ui"
import { Link } from "@nodiox/i18n"
import { motion, useReducedMotion } from "framer-motion"

import { apiFetch } from "~/lib/api-client"

import type { ForgotPasswordData } from "~/lib/password-schemas"

interface Step1EmailProps {
  onNext: () => void
}

export function Step1Email({ onNext }: Step1EmailProps) {
  const t = useTranslations("ForgotPassword")
  const common = useTranslations("Index")
  const [isLoading, setIsLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  
  const shouldReduceMotion = useReducedMotion()

  const [isEmailFocused, setIsEmailFocused] = useState(false)
  const [isEmailTouched, setIsEmailTouched] = useState(false)

  const {
    register,
    watch,
    formState: { errors },
    trigger,
  } = useFormContext<ForgotPasswordData>()

  const email = watch("email")

  // Check validity without full form validation
  const isValid = email && !errors.email

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsEmailTouched(true)
    const valid = await trigger("email")
    if (valid) {
      setIsLoading(true)
      setServerError(null)
      try {
        const res = await apiFetch("/api/auth/forgot-password/send-otp", {
          method: "POST",
          body: JSON.stringify({ email: email }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to trigger recovery")
        onNext()
      } catch (err: any) {
        setServerError(err.message)
        console.error("Forgot Password Error:", err.message)
      } finally {
        setIsLoading(false)
      }
    }
  }

  const motionProps = shouldReduceMotion ? {} : {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.3 }
  }

  return (
    <motion.form
      key="form"
      {...motionProps}
      className="flex flex-col gap-6"
      onSubmit={handleNext}
      aria-labelledby="forgot-password-title"
      aria-busy={isLoading}
      noValidate
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="relative mb-2 flex h-12 w-12 items-center justify-center">
          <Image
            src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f512/512.webp"
            alt="🔒"
            width={48}
            height={48}
            unoptimized
            className="block h-12 w-12"
          />
        </div>
        <h1 id="forgot-password-title" className="text-2xl font-bold">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <Field>
        <FieldLabel htmlFor="email">{t("emailLabel")}</FieldLabel>
        <div className="flex flex-col">
          <Input
            id="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            {...register("email")}
            onFocus={() => setIsEmailFocused(true)}
            onBlur={() => {
              setIsEmailFocused(false)
              setIsEmailTouched(true)
              trigger("email")
            }}
            disabled={isLoading}
            isError={isEmailTouched && !!errors.email}
            autoFocus
            autoComplete="email"
            aria-describedby="email-error"
            lang="en"
          />
          <div
            id="email-error"
            role="alert"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out",
              isEmailFocused && isEmailTouched && !!errors.email
                ? "mt-2 max-h-10 opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <X className="size-3.5 shrink-0" />
            <span>
              {errors.email?.message ? common(errors.email.message as any) : ""}
            </span>
          </div>

          {/* Server-side Error Display */}
          <div
            id="server-error"
            role="alert"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out",
              serverError ? "mt-2 max-h-12 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <X className="size-3.5 shrink-0" />
            <span className="leading-normal">{serverError}</span>
          </div>
        </div>
      </Field>

      <div className="flex flex-col gap-2">
        <ShimmerButton
          type="submit"
          className="w-full"
          loading={isLoading}
          shimmerDisabled={!isValid}
        >
          {t("resetPassword")}
        </ShimmerButton>

        <Link
          href="/login"
          className={cn(
            "text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors block text-center",
            isLoading && "pointer-events-none opacity-50"
          )}
        >
          {t("backToLogin")}
        </Link>
      </div>
    </motion.form>
  )
}
