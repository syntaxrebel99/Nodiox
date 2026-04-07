"use client"

import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { useForm, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "@nodiox/utils"
import { useLocale } from "next-intl"
import { AnimatePresence } from "framer-motion"

import { FieldGroup, Confetti, type ConfettiApi } from "@nodiox/ui"
import { createOnboardingSchema, type OnboardingData } from "~/lib/onboarding-schema"
// Removed backend imports
type AuthError = string;

// Step Components
import { Step1Name } from "./step1-name"
import { Step2Email } from "./step2-email"
import { Step3EmailMfa } from "./step3-email-mfa"
import { Step4Phone } from "./step4-phone"
import { Step5PhoneMfa } from "./step5-phone-mfa"
import { Step6Password } from "./step6-password"
import { Step7Success } from "./step7-success"

const STORAGE_KEY = "nodiox_onboarding_draft"

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const locale = useLocale()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [serverError, setServerError] = useState<AuthError | null>(null)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)

  const methods = useForm<OnboardingData>({
    resolver: zodResolver(createOnboardingSchema(locale)),
    defaultValues: {
      fullName: "",
      email: "",
      phoneNumber: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onChange",
  })

  // Derive first name for personalized success message
  const fullName = methods.watch("fullName") || ""
  const firstName = fullName.split(" ")[0] || ""

  // Re-hydrate from session storage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const { step: savedStep, ...formData } = parsed
        // Don't re-hydrate if we are at step 7 (success)
        if (savedStep && savedStep < 7) setStep(savedStep)
        methods.reset({
          password: "",
          confirmPassword: "",
          ...formData
        })
      } catch (e) {
        console.error("Failed to re-hydrate onboarding draft:", e)
      }
    }
  }, [methods])

  // Auto-persist changes to session storage
  useEffect(() => {
    // Stop persisting if we reached success state
    if (step === 7) return;

    const subscription = methods.watch((value) => {
      // SEC-08: Explicitly exclude the password and confirmPassword from the saved draft object
      const { password, confirmPassword, ...safeValues } = value as OnboardingData
      const dataToSave = { 
        ...safeValues, 
        step 
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
    })
    return () => subscription.unsubscribe()
  }, [methods, step])

  const onSubmit = async (data: OnboardingData) => {
    if (step !== 6) return
    setIsLoading(true)
    setServerError(null)
    
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        body: JSON.stringify({
          password: data.password,
          fullName: data.fullName,
          phone: data.phoneNumber,
        })
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData.error || "Failed to create account")
      
      sessionStorage.removeItem(STORAGE_KEY)
      setAlreadyRegistered(false)
      setStep(7) // Transition to Success!
    } catch (err: any) {
      setServerError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const confettiRef = useRef<ConfettiApi>(null)

  // Side Cannons Celebration pattern (Full UI Parity with Password Reset)
  useEffect(() => {
    let rafId: number;

    if (step === 7 && confettiRef.current) {
      const end = Date.now() + 3 * 1000 // 3 seconds
      const colors = ["#26ccff", "#a25afd", "#ff5e7e", "#88ff5a", "#fcff42", "#ffa62d", "#ff36ff"]

      const frame = () => {
        if (Date.now() > end) return

        confettiRef.current?.fire({
          particleCount: 5,
          angle: 60,
          spread: 55,
          startVelocity: 60,
          origin: { x: 0, y: 0.5 },
          colors: colors,
        })
        confettiRef.current?.fire({
          particleCount: 5,
          angle: 120,
          spread: 55,
          startVelocity: 60,
          origin: { x: 1, y: 0.5 },
          colors: colors,
        })

        rafId = requestAnimationFrame(frame)
      }

      frame()
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [step])

  return (
    <FormProvider {...methods}>
      <form
        className={cn("flex flex-col gap-6", className)}
        onSubmit={methods.handleSubmit(onSubmit)}
        noValidate
        aria-busy={isLoading}
        {...props}
      >
        <FieldGroup className="gap-4">
          <Confetti 
            key={step === 7 ? "celebrate" : "wait"}
            ref={confettiRef} 
            className="fixed inset-0 pointer-events-none z-[100] h-full w-full" 
          />
          <AnimatePresence mode="wait" initial={false}>
            {step === 1 && (
              <Step1Name 
                key="step1"
                onNext={() => setStep(2)} 
                isLoading={isLoading} 
              />
            )}

            {step === 2 && (
              <Step2Email 
                key="step2"
                onNext={async () => {
                  setIsLoading(true)
                  setServerError(null)
                  try {
                    const res = await fetch("/api/auth/send-otp", {
                      method: "POST",
                      body: JSON.stringify({ email: methods.getValues("email") }),
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error || "Failed to send OTP")
                    setStep(3)
                  } catch (err: any) {
                    setServerError(err.message)
                  } finally {
                    setIsLoading(false)
                  }
                }} 
                onBack={() => setStep(1)} 
                isLoading={isLoading}
                serverError={serverError}
                setServerError={setServerError}
              />
            )}

            {step === 3 && (
              <Step3EmailMfa 
                key="step3"
                // SKIP PHONE FOR NOW: GOTO Step 6
                onNext={() => setStep(6)} 
                onBack={() => setStep(2)} 
                isLoading={isLoading} 
                setIsLoading={setIsLoading} 
              />
            )}

            {step === 4 && (
              <Step4Phone 
                key="step4"
                onNext={async () => {
                  setIsLoading(true)
                  setServerError(null)
                  try {
                    const res = await fetch("/api/auth/send-otp", {
                      method: "POST",
                      body: JSON.stringify({ phone: methods.getValues("phoneNumber") }),
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error || "Failed to send SMS") 
                    setStep(5)
                  } catch (err: any) {
                    setServerError(err.message)
                  } finally {
                    setIsLoading(false)
                  }
                }} 
                onBack={() => setStep(3)} 
                isLoading={isLoading}
                serverError={serverError}
                setServerError={setServerError}
              />
            )}

            {step === 5 && (
              <Step5PhoneMfa 
                key="step5"
                onNext={() => setStep(6)} 
                onBack={() => setStep(4)} 
                isLoading={isLoading} 
                setIsLoading={setIsLoading} 
              />
            )}

            {step === 6 && (
              <Step6Password 
                key="step6"
                // BACK GOES TO STEP 3 SINCE PHONE IS SKIPPED
                onBack={() => setStep(3)} 
                isLoading={isLoading}
                serverError={serverError}
                setServerError={setServerError}
              />
            )}

            {step === 7 && (
              <Step7Success 
                key="step7"
                firstName={firstName}
                alreadyRegistered={alreadyRegistered}
              />
            )}
          </AnimatePresence>
        </FieldGroup>
      </form>
    </FormProvider>
  )
}
