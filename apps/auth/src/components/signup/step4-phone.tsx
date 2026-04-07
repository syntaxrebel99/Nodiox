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

interface Step4PhoneProps {
  onNext: () => void;
  onBack: () => void;
  isLoading: boolean;
  serverError: AuthError | null;
  setServerError: React.Dispatch<React.SetStateAction<AuthError | null>>;
}

export function Step4Phone({ onNext, onBack, isLoading, serverError, setServerError }: Step4PhoneProps) {
  const o = useTranslations("Onboarding")
  const { register, setValue, watch, trigger, formState: { errors } } = useFormContext<OnboardingData>()

  const [phoneTouched, setPhoneTouched] = useState(false)
  const [isPhoneFocused, setIsPhoneFocused] = useState(false)

  const phoneNumber = watch("phoneNumber") || ""
  const fullName = watch("fullName") || ""
  const firstName = fullName.trim().split(" ")[0] || ""

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = e.target.value.replace(/[^\d\s\-\+\(\)]/g, "")
    setValue("phoneNumber", filtered, { shouldValidate: true })
    if (phoneTouched) setPhoneTouched(false)
    if (serverError) setServerError(null)
  }

  const handleBlur = () => {
    setIsPhoneFocused(false)
    setPhoneTouched(true)
  }

  const handleNextClick = async () => {
    setPhoneTouched(true)
    const isValid = await trigger("phoneNumber")
    if (isValid) {
      onNext()
    } else {
      document.getElementById("phoneNumber")?.focus()
    }
  }

  const showPhoneErrorLine = phoneTouched && !!errors.phoneNumber
  const showPhoneWarning = isPhoneFocused && phoneTouched && !!errors.phoneNumber

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
            src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f919_1f3fb/512.gif"
            alt="🤙🏻"
            width={48}
            height={48}
            unoptimized
            className="block h-12 w-12"
          />
        </div>
        <h1 className="text-2xl font-bold">
          {o("step4Title", { firstName })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {o("step4Subtitle")}
        </p>
      </div>

      <Field key="phone-field">
        <FieldLabel htmlFor="phoneNumber">{o("phoneLabel")}</FieldLabel>
        <div className="flex flex-col">
          <Input
            id="phoneNumber"
            type="tel"
            placeholder={o("phonePlaceholder")}
            {...register("phoneNumber")}
            onChange={handlePhoneChange}
            onFocus={() => setIsPhoneFocused(true)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleNextClick()
              }
            }}
            disabled={isLoading}
            autoFocus
            autoComplete="tel"
            isError={showPhoneErrorLine}
            aria-describedby="phone-error"
            lang="en"
          />
          <div
            id="phone-error"
            role="alert"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out",
              showPhoneWarning || serverError
                ? "mt-2 max-h-10 opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <X className="size-3.5 shrink-0" />
            <span>{serverError ? (o.has(serverError as any) ? o(serverError as any) : serverError) : (errors.phoneNumber?.message ? o(errors.phoneNumber.message as any) : "")}</span>
          </div>
        </div>
      </Field>

      <div className="flex flex-col gap-2">
        <ShimmerButton
          type="button"
          onClick={handleNextClick}
          className="w-full"
          loading={isLoading}
          shimmerDisabled={!!errors.phoneNumber || !phoneNumber}
        >
          {o("continue")}
        </ShimmerButton>

        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 mt-0 transition-colors"
          disabled={isLoading}
        >
          {o("back")}
        </button>
      </div>
    </motion.div>
  )
}
