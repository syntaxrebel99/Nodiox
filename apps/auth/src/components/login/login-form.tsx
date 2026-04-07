"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useForm, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "@nodiox/utils"
import { useLocale } from "next-intl"
import { AnimatePresence } from "framer-motion"
import { FieldDescription } from "@nodiox/ui"
import { useRouter } from "@nodiox/i18n"

import { createLoginSchema, type LoginData } from "~/lib/login-schema"
import { apiFetch } from "~/lib/api-client"
// Removed loginUser import
import { Step1Credentials } from "./step1-credentials"
import { Step2Mfa } from "./step2-mfa"

const STORAGE_KEY = "nodiox_login_draft"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const locale = useLocale()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const methods = useForm<LoginData>({
    resolver: zodResolver(createLoginSchema()),
    defaultValues: {
      loginMethod: "email",
      email: "",
      phoneNumber: "",
      password: "",
      rememberMe: false,
    },
    mode: "onChange",
  })

  // Re-hydrate from session storage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const { step: savedStep, ...formData } = parsed
        if (savedStep) setStep(savedStep)
        methods.reset({
          password: "",
          ...formData
        })
      } catch (e) {
        console.error("Failed to re-hydrate login draft:", e)
      }
    }
  }, [methods])

  // Auto-persist changes to session storage
  useEffect(() => {
    const subscription = methods.watch((value) => {
      // SEC-08: Explicitly exclude the password from the saved draft object
      const { password, ...safeValues } = value as LoginData
      const dataToSave = { 
        ...safeValues, 
        step 
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
    })
    return () => subscription.unsubscribe()
  }, [methods, step])

  const onSubmit = async (data: LoginData) => {
    if (step === 1) {
      setIsLoading(true)
      setServerError(null)
      try {
        const res = await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: data.email,
            phone: data.phoneNumber,
            password: data.password,
          }),
        })
        const respData = await res.json()
        if (!res.ok) throw new Error(respData.error || "Login failed")
        
        setStep(2)
      } catch (err: any) {
        if (err.message === "Invalid credentials") {
          setServerError("invalid_credentials")
        } else {
          setServerError(err.message)
        }
      } finally {
        setIsLoading(false)
      }
    }
  }

  const handleMfaSuccess = () => {
    sessionStorage.removeItem(STORAGE_KEY)
    const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3002'
    window.location.href = dashboardUrl
  }

  return (
    <FormProvider {...methods}>
      <form 
        className={cn("flex flex-col gap-6", className)} 
        onSubmit={methods.handleSubmit((data) => onSubmit(data as unknown as LoginData))}
        noValidate
        aria-busy={isLoading}
        {...props}
      >
        <AnimatePresence mode="wait" initial={false}>
          {step === 1 && (
            <Step1Credentials 
              key="step1"
              onNext={() => setStep(2)}
              isLoading={isLoading}
              serverError={serverError}
              setServerError={setServerError}
            />
          )}

          {step === 2 && (
            <Step2Mfa 
              key="step2"
              onBack={() => setStep(1)}
              onSuccess={handleMfaSuccess}
            />
          )}
        </AnimatePresence>
      </form>
    </FormProvider>
  )
}
