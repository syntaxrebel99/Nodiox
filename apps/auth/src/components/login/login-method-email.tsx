"use client"

import * as React from "react"
import { useState } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslations } from "next-intl"
import { cn } from "@nodiox/utils"
import { X, Mail } from "lucide-react"
import { Input, Field, FieldLabel } from "@nodiox/ui"
import { type LoginData } from "~/lib/login-schema"
import { motion } from "framer-motion"

interface LoginMethodEmailProps {
  isLoading: boolean;
  serverError: string | null;
}

export function LoginMethodEmail({ isLoading, serverError }: LoginMethodEmailProps) {
  const t = useTranslations("Index")
  const { register, formState: { errors } } = useFormContext<LoginData>()
  const [touched, setTouched] = useState(false)
  const [focused, setFocused] = useState(false)

  return (
    <motion.div
      key="email"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
    >
      <Field>
        <FieldLabel htmlFor="email">{t("emailLabel")}</FieldLabel>
        <div className="flex flex-col">
          <Input
            id="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            {...register("email")}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); setTouched(true) }}
            disabled={isLoading}
            isError={(touched && !!errors.email) || !!serverError}
            aria-describedby="email-error"
            autoFocus
          />
          <div
            id="email-error"
            role="alert"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out",
              (focused && touched && !!errors.email)
                ? "mt-2 max-h-10 opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <X className="size-3.5 shrink-0" />
            <span>{errors.email?.message ? t(errors.email.message as string) : ""}</span>
          </div>
        </div>
      </Field>
    </motion.div>
  )
}
