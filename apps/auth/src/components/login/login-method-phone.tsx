"use client"

import * as React from "react"
import { useState } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslations } from "next-intl"
import { cn } from "@nodiox/utils"
import { X, Phone } from "lucide-react"
import { Input, Field, FieldLabel } from "@nodiox/ui"
import { type LoginData } from "~/lib/login-schema"
import { motion } from "framer-motion"

interface LoginMethodPhoneProps {
  isLoading: boolean;
  serverError: string | null;
}

export function LoginMethodPhone({ isLoading, serverError }: LoginMethodPhoneProps) {
  const t = useTranslations("Index")
  const { register, setValue, formState: { errors } } = useFormContext<LoginData>()
 
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [isPhoneFocused, setIsPhoneFocused] = useState(false)
 
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = e.target.value.replace(/[^\d\s\-+()]/g, "")
    setValue("phoneNumber", filtered, { shouldValidate: true })
    if (phoneTouched) setPhoneTouched(false)
  }
 
  const handleBlur = () => {
    setIsPhoneFocused(false)
    setPhoneTouched(true)
  }
 
  const showPhoneErrorLine = phoneTouched && (!!errors.phoneNumber || !!serverError)
  const showPhoneWarning = isPhoneFocused && phoneTouched && !!errors.phoneNumber
 
  return (
    <motion.div
      key="phone"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      <Field>
        <FieldLabel htmlFor="phoneNumber">{t("phoneLabel")}</FieldLabel>
        <div className="flex flex-col">
          <Input
            id="phoneNumber"
            type="tel"
            placeholder={t("phonePlaceholder")}
            {...register("phoneNumber")}
            onChange={handlePhoneChange}
            onFocus={() => setIsPhoneFocused(true)}
            onBlur={handleBlur}
            disabled={isLoading}
            isError={showPhoneErrorLine}
            autoFocus
            autoComplete="tel"
            aria-describedby="phone-error"
          />
          <div
            id="phone-error"
            role="alert"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out",
              showPhoneWarning
                ? "mt-2 max-h-10 opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <X className="size-3.5 shrink-0" />
            <span>{errors.phoneNumber?.message ? t(errors.phoneNumber.message as string) : ""}</span>
          </div>
        </div>
      </Field>
    </motion.div>
  )
}

