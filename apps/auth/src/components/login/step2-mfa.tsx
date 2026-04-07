"use client"

import * as React from "react"
import { useState } from "react"
import Image from "next/image"
import { cn } from "@nodiox/utils"
import { ArrowLeft, RefreshCw, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { ShimmerButton, Input } from "@nodiox/ui"
import { useMfaLogic } from "~/hooks/use-mfa-logic"
import { motion } from "framer-motion"

interface Step2MfaProps {
  onBack: () => void
  onSuccess: () => void
}

// Removed verifyOtp API
import { useFormContext } from "react-hook-form"
import { type LoginData } from "~/lib/login-schema"

export function Step2Mfa({ onBack, onSuccess }: Step2MfaProps) {
  const t = useTranslations("MFA")
  const [isLoading, setIsLoading] = useState(false)

  const verifyOtpWrapper = async (otpStr: string) => {
    setIsLoading(true)
    setOtpError(null)
    try {
      const body: any = { token: otpStr, type: "email" }
      if (email) body.email = email
      if (phoneNumber) body.phone = phoneNumber

      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Verification failed")
      
      onSuccess()
    } catch (err: any) {
      setOtpError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const { watch } = useFormContext<LoginData>()
  const loginMethod = watch("loginMethod")
  const email = watch("email")
  const phoneNumber = watch("phoneNumber")

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
      try {
        const body: any = { password: watch("password") }
        if (email) body.email = email
        if (phoneNumber) body.phone = phoneNumber

        const res = await fetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Resend failed")
      } catch (err: any) {
        setOtpError(err.message)
        throw err
      }
    }
  })
 
  const formSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isOtpComplete) {
      verifyOtpWrapper(otp.join(""))
    }
  }
 
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col items-center gap-1 text-center text-balance">
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
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
 
      <div className="space-y-6">
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
                dir="ltr"
                onChange={(e) => handleOtpChange(e.target.value, index)}
                onKeyDown={(e) => handleOtpKeyDown(e, index)}
                onFocus={() => handleFocus(index)}
                disabled={isLoading}
                containerClassName="size-10"
                className="text-center text-2xl md:text-2xl font-bold h-10 p-0"
                style={{ textAlign: "center" }}
                isError={!!otpError}
                aria-describedby="otp-error"
                aria-label={t("otpDigitLabel", { index: index + 1 })}
                autoComplete="one-time-code"
              />
            ))}
          </div>
 
          <div className="flex flex-col gap-0 w-full items-center">
          <div
            id="otp-error"
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
            onClick={formSubmit}
            className="w-full"
            loading={isLoading}
            shimmerDisabled={!isOtpComplete}
          >
            {t("verify")}
          </ShimmerButton>
 
          <div className="flex flex-col items-center gap-0 w-full">
            {/* Logic Gate 0: Too Many Attempts */}
            <div
              className={cn(
                "flex items-center justify-center text-xs text-destructive text-center overflow-hidden transition-all duration-300 ease-in-out w-full",
                resendCount >= 3
                  ? "max-h-10 opacity-100 translate-y-0"
                  : "max-h-0 opacity-0 -translate-y-1"
              )}
            >
              <span>{t("tooManyAttempts")}</span>
            </div>
            
            {/* Logic Gate 1: Resend Code (shown when timer is 0 and not too much time passed) */}
            <div
              className={cn(
                "flex items-center justify-center overflow-hidden transition-all duration-300 ease-in-out w-full",
                timer === 0 && stepTime < 90 && !resendSuccess && resendCount < 3
                  ? "max-h-10 opacity-100 translate-y-0"
                  : "max-h-0 opacity-0 -translate-y-1"
              )}
            >
              <span className="text-xs text-muted-foreground mr-1.5 rtl:ml-1.5 rtl:mr-0 text-center">
                {t("didntGetCode")}
              </span>
              <button
                type="button"
                disabled={timer > 0 || isLoading}
                onClick={triggerResend}
                className="text-xs text-primary font-medium hover:underline underline-offset-4 transition-colors disabled:pointer-events-none shrink-0"
              >
                {t("resendCode")}
              </button>
            </div>
 
            {/* Logic Gate 2: Spam Tip (shown after 90 seconds) */}
            <div
              className={cn(
                "flex items-center justify-center text-xs text-muted-foreground text-center overflow-hidden transition-all duration-300 ease-in-out w-full",
                stepTime >= 90 && !resendSuccess
                  ? "max-h-10 opacity-100 translate-y-0"
                  : "max-h-0 opacity-0 -translate-y-1"
              )}
            >
              <span>{t("checkSpamTip")}</span>
            </div>
 
            {/* Logic Gate 3: Success Message */}
            <div
              className={cn(
                "flex items-center justify-center text-xs text-primary overflow-hidden transition-all duration-300 ease-in-out w-full",
                resendSuccess
                  ? "max-h-10 opacity-100 translate-y-0"
                  : "max-h-0 opacity-0 -translate-y-1"
              )}
            >
              <span>{t("newCodeSent")}</span>
            </div>
 
            {/* Logic Gate 4: Back Button (shown when timer > 0 and no other message active) */}
            <div
              className={cn(
                "flex items-center justify-center overflow-hidden transition-all duration-300 ease-in-out w-full pb-0.5",
                timer > 0 && !resendSuccess && stepTime < 90
                  ? "max-h-10 opacity-100 translate-y-0"
                  : "max-h-0 opacity-0 -translate-y-1"
              )}
            >
              <button
                type="button"
                onClick={onBack}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
              >
                {t("back")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
