import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslations, useLocale } from "next-intl"
import Image from "next/image"
import { cn } from "@nodiox/utils"
import { X } from "lucide-react"
import { Input, ShimmerButton } from "@nodiox/ui"
import { type OnboardingData } from "~/lib/onboarding-schema"
import { useMfaLogic } from "~/hooks/use-mfa-logic"
import { motion } from "framer-motion"

interface Step3EmailMfaProps {
  onNext: () => void;
  onBack: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

// Removed API services

export function Step3EmailMfa({ onNext, onBack, isLoading, setIsLoading }: Step3EmailMfaProps) {
  const o = useTranslations("Onboarding")
  const locale = useLocale()
  const { watch } = useFormContext<OnboardingData>()

  const email = watch("email") || ""
  const fullName = watch("fullName") || ""
  const firstName = fullName.trim().split(" ")[0] || ""

  const verifyOtpWrapper = async (newOtpStr: string) => {
    setIsLoading(true)
    setOtpError(null)
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email: email, token: newOtpStr, type: "signup" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Invalid verification code")
      onNext()
    } catch (err: any) {
      setOtpError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const {
    otp,
    isOtpComplete,
    otpError,
    setOtpError,
    mfaInputRefs,
    timer,
    stepTime,
    resendSuccess,
    triggerResend,
    resendCount,
    handleOtpChange,
    handleOtpKeyDown,
    handleOtpPaste,
    handleFocus
  } = useMfaLogic({
    length: 6,
    onComplete: verifyOtpWrapper,
    onResend: async () => {
      // simulate delay
      await new Promise(r => setTimeout(r, 500))
    }
  });

  const handleNextClick = () => {
    if (isOtpComplete) {
      verifyOtpWrapper(otp.join(""))
    }
  }

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
            src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f9d0/512.gif"
            alt="🧐"
            width={48}
            height={48}
            unoptimized
            className="block h-12 w-12"
          />
        </div>
        <h1 className="text-2xl font-bold">
          {o("step3Title", { firstName })}
        </h1>
        <p className="text-sm text-balance text-muted-foreground">
          {o("step3Subtitle", { email })}
        </p>
      </div>

      <div className="flex flex-col gap-0">
        <div className="flex justify-center gap-2" onPaste={handleOtpPaste} dir="ltr">
          {otp.map((digit, index) => (
            <Input
              key={index}
              ref={(el) => { mfaInputRefs.current[index] = el }}
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={1}
              value={digit}
              isError={!!otpError}
              aria-describedby="email-mfa-error"
              aria-label={o("otpDigitLabel", { index: index + 1 })}
              autoComplete="one-time-code"
              dir="ltr"
              onChange={(e) => handleOtpChange(e.target.value, index)}
              onKeyDown={(e) => handleOtpKeyDown(e, index)}
              onFocus={() => handleFocus(index)}
              disabled={isLoading}
              containerClassName="size-10"
              className="text-center text-2xl md:text-2xl font-bold h-10 !p-0"
              style={{ textAlign: "center" }}
            />
          ))}
        </div>

        <div className="flex flex-col gap-0 w-full items-center">
          <div
            id="email-mfa-error"
            role="alert"
            aria-live="polite"
            className={cn("flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out", otpError ? "mt-2 max-h-10 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-1")}
          >
            <X className="size-3.5 shrink-0" />
            <span>{otpError}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <ShimmerButton
          type="button"
          onClick={handleNextClick}
          className="w-full"
          loading={isLoading}
          shimmerDisabled={!isOtpComplete}
        >
          {o("continue")}
        </ShimmerButton>

        <div className="flex flex-col items-center gap-0 w-full">
          <div
            className={cn(
              "flex items-center justify-center text-xs text-destructive text-center overflow-hidden transition-all duration-300 ease-in-out w-full",
              resendCount >= 3 ? "max-h-10 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <span>{o("tooManyAttempts")}</span>
          </div>

          <div
            className={cn(
              "flex items-center justify-center overflow-hidden transition-all duration-300 ease-in-out w-full",
              timer === 0 && stepTime < 90 && !resendSuccess && resendCount < 3 ? "max-h-10 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <span className="text-xs text-muted-foreground mr-1.5 rtl:ml-1.5 rtl:mr-0 text-center">
              {o("didntGetCode")}
            </span>
            <button
              type="button"
              disabled={timer > 0 || isLoading}
              onClick={triggerResend}
              className="text-xs text-primary font-medium hover:underline underline-offset-4 transition-colors disabled:pointer-events-none shrink-0"
            >
              {o("resendCode")}
            </button>
          </div>

          <div
            className={cn(
              "flex items-center justify-center text-xs text-muted-foreground text-center overflow-hidden transition-all duration-300 ease-in-out w-full",
              stepTime >= 90 && !resendSuccess ? "max-h-10 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <span>{o("checkSpamTip")}</span>
          </div>

          <div
            className={cn(
              "flex items-center justify-center text-xs text-primary overflow-hidden transition-all duration-300 ease-in-out w-full",
              resendSuccess ? "max-h-10 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <span>{o("newCodeSent")}</span>
          </div>

          <div
            className={cn(
              "flex items-center justify-center overflow-hidden transition-all duration-300 ease-in-out w-full pb-0.5",
              timer > 0 && !resendSuccess && stepTime < 90 ? "max-h-10 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
            >
              {o("back")}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
