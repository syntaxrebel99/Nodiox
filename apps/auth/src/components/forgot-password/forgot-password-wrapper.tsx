"use client"

import * as React from "react"
import { useState } from "react"
import { useForm, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "@nodiox/utils"
import { AnimatePresence } from "framer-motion"
import { useTranslations } from "next-intl"

import { createForgotPasswordSchema, type ForgotPasswordData } from "~/lib/password-schemas"
import { useRouter } from "@nodiox/i18n"
import { Step1Email } from "./step1-email"
import { Step2Mfa } from "./step2-mfa"

export function ForgotPasswordWrapper({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const common = useTranslations("Index")
  const [step, setStep] = useState(1)
  const router = useRouter()

  const methods = useForm<ForgotPasswordData>({
    resolver: zodResolver(createForgotPasswordSchema()),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onChange",
  })

  return (
    <div className={cn("w-full", className)} {...props}>
      <FormProvider {...methods}>
        <AnimatePresence mode="wait" initial={false}>
          {step === 1 && (
            <Step1Email 
              key="step1"
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <Step2Mfa 
              key="step2"
              onBack={() => setStep(1)}
              onSuccess={() => {
                router.push("/password-reset")
              }}
            />
          )}
        </AnimatePresence>
      </FormProvider>
    </div>
  )
}
