import * as React from "react"
import { useState } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslations, useLocale } from "next-intl"
import Image from "next/image"
import { cn } from "@nodiox/utils"
import { X } from "lucide-react"
import { Field, FieldLabel, FieldDescription, Input, ShimmerButton } from "@nodiox/ui"
import { Link } from "@nodiox/i18n"
import { type OnboardingData } from "~/lib/onboarding-schema"

import { motion, useReducedMotion } from "framer-motion"

interface Step1NameProps {
  onNext: () => void;
  isLoading: boolean;
}

export function Step1Name({ onNext, isLoading }: Step1NameProps) {
  const o = useTranslations("Onboarding")
  const t = useTranslations("Index")
  const locale = useLocale()
  const { register, setValue, watch, trigger, formState: { errors } } = useFormContext<OnboardingData>()

  const shouldReduceMotion = useReducedMotion()

  const [nameTouched, setNameTouched] = useState(false)
  const [isNameFocused, setIsNameFocused] = useState(false)

  const fullName = watch("fullName") || ""

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let filtered = e.target.value
    if (locale === "ar") {
      filtered = filtered.replace(/[^\p{Script=Arabic}\s'-]+/gu, "")
    } else {
      filtered = filtered.replace(/[^\p{Script=Latin}\s'-]+/gu, "")
    }

    const capitalized = filtered
      .split(" ")
      .map((word) =>
        word.split('-')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join('-')
      )
      .join(" ")

    setValue("fullName", capitalized, { shouldValidate: true })
    if (nameTouched) setNameTouched(false)
  }

  const handleBlur = () => {
    setIsNameFocused(false)
    setNameTouched(true)
  }

  const handleNextClick = async () => {
    setNameTouched(true)
    const isValid = await trigger("fullName")
    if (isValid) {
      onNext()
    } else {
      document.getElementById("fullName")?.focus()
    }
  }

  const showNameErrorLine = nameTouched && !!errors.fullName
  const showNameWarning = isNameFocused && nameTouched && !!errors.fullName
  const isComplete = fullName.trim().split(/\s+/).filter(Boolean).length >= 2;

  const motionProps = shouldReduceMotion ? {} : {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.3 }
  }

  return (
    <motion.div 
      {...motionProps}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="relative mb-2 flex h-12 w-12 items-center justify-center">
          <Image
            src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f600/512.webp"
            alt="😀"
            width={48}
            height={48}
            unoptimized
            className="block h-12 w-12"
          />
        </div>
        <h1 className="text-2xl font-bold">
          {o("step1Title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {o("step1Subtitle")}
        </p>
      </div>

      <Field key="name-field">
        <FieldLabel htmlFor="fullName">{o("fullNameLabel")}</FieldLabel>
        <div className="flex flex-col">
          <Input
            id="fullName"
            placeholder={o("fullNamePlaceholder")}
            {...register("fullName")}
            onChange={handleNameChange}
            onFocus={() => setIsNameFocused(true)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleNextClick()
              }
            }}
            disabled={isLoading}
            autoFocus
            autoComplete="name"
            isError={showNameErrorLine}
            aria-describedby="fullName-error"
          />
          <div
            id="fullName-error"
            role="alert"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out",
              showNameWarning
                ? "mt-2 max-h-10 opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <X className="size-3.5 shrink-0" />
            <span>{errors.fullName?.message ? o(errors.fullName.message as any) : ""}</span>
          </div>
        </div>
      </Field>

      <div className="flex flex-col gap-2">
        <ShimmerButton
          type="button"
          onClick={handleNextClick}
          className="w-full"
          loading={isLoading}
          shimmerDisabled={!!errors.fullName || !isComplete}
        >
          {o("continue")}
        </ShimmerButton>

        <FieldDescription className="text-center">
          {o("alreadyHaveAccount")}{" "}
          <Link
            href="/login"
            className="text-primary hover:underline underline-offset-4"
          >
            {t("login")}
          </Link>
        </FieldDescription>
      </div>
    </motion.div>
  )
}
