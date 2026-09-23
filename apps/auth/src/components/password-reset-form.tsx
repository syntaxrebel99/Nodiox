"use client"

import * as React from "react"
import { useForm, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "@nodiox/i18n"
import { createPasswordAndConfirmSchema as createResetPasswordSchema, type PasswordAndConfirmData as ResetPasswordData } from "~/lib/password-schemas"
import { Step3NewPassword } from "~/components/forgot-password/step3-new-password"

export function PasswordResetForm() {
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
          onBack={() => {
            router.push("/login")
          }} 
        />
      </FormProvider>
    </div>
  )
}
