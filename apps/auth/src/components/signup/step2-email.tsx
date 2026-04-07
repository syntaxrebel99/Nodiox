import * as React from "react"
import { useState } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslations } from "next-intl"
import Image from "next/image"
import { cn } from "@nodiox/utils"
import { X } from "lucide-react"
import { Field, FieldLabel, Input, ShimmerButton } from "@nodiox/ui"
import { type OnboardingData } from "~/lib/onboarding-schema"
type AuthError = string;

import { motion } from "framer-motion"

interface Step2EmailProps {
  onNext: () => void;
  onBack: () => void;
  isLoading: boolean;
  serverError: AuthError | null;
  setServerError: React.Dispatch<React.SetStateAction<AuthError | null>>;
}

export function Step2Email({ onNext, onBack, isLoading, serverError, setServerError }: Step2EmailProps) {
  const o = useTranslations("Onboarding")
  const { register, setValue, watch, trigger, formState: { errors } } = useFormContext<OnboardingData>()

  const [emailTouched, setEmailTouched] = useState(false)
  const [isEmailFocused, setIsEmailFocused] = useState(false)

  const email = watch("email") || ""
  const fullName = watch("fullName") || ""
  const firstName = fullName.trim().split(" ")[0] || ""

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const lowercased = e.target.value.toLowerCase()
    const sanitized = lowercased.replace(/\s+/g, "")
    setValue("email", sanitized, { shouldValidate: true })
    if (emailTouched) setEmailTouched(false)
    if (serverError) setServerError(null)
  }

  const handleBlur = () => {
    setIsEmailFocused(false)
    setEmailTouched(true)
  }

  const handleNextClick = async () => {
    setEmailTouched(true)
    const isValid = await trigger("email")
    if (isValid) {
      onNext()
    } else {
      document.getElementById("email")?.focus()
    }
  }

  const showEmailErrorLine = emailTouched && !!errors.email
  const showEmailWarning = isEmailFocused && emailTouched && !!errors.email

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="relative mb-2 flex h-12 w-12 items-center justify-center">
          <Image
            src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f48c/512.gif"
            alt="💌"
            width={48}
            height={48}
            unoptimized
            className="block h-12 w-12"
          />
        </div>
        <h1 className="text-2xl font-bold">
          {o("step2Title", { firstName })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {o("step2Subtitle")}
        </p>
      </div>

      <Field key="email-field">
        <FieldLabel htmlFor="email">{o("emailLabel")}</FieldLabel>
        <div className="flex flex-col">
          <Input
            id="email"
            type="email"
            placeholder={o("emailPlaceholder")}
            {...register("email")}
            onChange={handleEmailChange}
            onFocus={() => setIsEmailFocused(true)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleNextClick()
              }
            }}
            disabled={isLoading}
            autoFocus
            autoComplete="email"
            isError={showEmailErrorLine}
            aria-describedby="email-error"
            lang="en"
          />
          <div
            className={cn(
              "flex text-xs text-muted-foreground overflow-hidden transition-all duration-300 ease-in-out",
              isEmailFocused && !showEmailWarning
                ? "mt-2 max-h-10 opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <span>{o("emailPrivacyDisclaimer")}</span>
          </div>
          <div
            id="email-error"
            role="alert"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out",
              showEmailWarning || serverError
                ? "mt-2 max-h-10 opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <X className="size-3.5 shrink-0" />
            <span>
              {serverError 
                ? (o.has(serverError as any) ? o(serverError as any) : serverError) 
                : (errors.email?.message ? o(errors.email.message as any) : "")}
            </span>
          </div>
        </div>
      </Field>

      <div className="flex flex-col gap-2">
        <ShimmerButton
          type="button"
          onClick={handleNextClick}
          className="w-full"
          loading={isLoading}
          shimmerDisabled={!!errors.email || !email}
        >
          {o("sendOtpCode")}
        </ShimmerButton>

        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
          disabled={isLoading}
        >
          {o("back")}
        </button>
      </div>
    </motion.div>
  )
}
