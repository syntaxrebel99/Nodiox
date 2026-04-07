"use client"

import * as React from "react"
import { useForm, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "@nodiox/i18n"
import { createResetPasswordSchema, type ResetPasswordData } from "~/lib/reset-password-schema"
import { Step3NewPassword } from "~/components/forgot-password/step3-new-password"

interface PasswordResetFormProps {
  code?: string;
  token?: string;
}

export function PasswordResetForm({ code, token }: PasswordResetFormProps) {
  const router = useRouter()
  const methods = useForm<ResetPasswordData>({
    resolver: zodResolver(createResetPasswordSchema()),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    mode: "onChange",
  })

  return (
    <div className="w-full">
      <FormProvider {...methods}>
        <Step3NewPassword 
          otp={token || code || "session"} 
          onBack={() => {
            router.push("/login")
          }} 
        />
      </FormProvider>
    </div>
  )
}
