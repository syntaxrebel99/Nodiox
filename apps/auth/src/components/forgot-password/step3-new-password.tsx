"use client"

import * as React from "react"
import { useState, useRef } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslations } from "next-intl"
import Image from "next/image"
import { cn } from "@nodiox/utils"
import { X, Check, Eye, EyeOff } from "lucide-react"
import { Field, FieldLabel, Input, ShimmerButton } from "@nodiox/ui"
import { type PasswordAndConfirmData as ResetPasswordData } from "~/lib/password-schemas"
import { motion, useReducedMotion } from "framer-motion"
import { useRouter } from "@nodiox/i18n"
import { apiFetch } from "~/lib/api-client"

interface Step3NewPasswordProps {
  onBack: () => void
  otp: string // Either the 6-digit OTP or a secure resetToken UUID
}

export function Step3NewPassword({ onBack, otp }: Step3NewPasswordProps) {
  const t = useTranslations("PasswordReset")
  const common = useTranslations("Index")
  const router = useRouter()
  
  const { register, watch, trigger, formState: { errors } } = useFormContext<ResetPasswordData>()

  const shouldReduceMotion = useReducedMotion()

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [passwordTouched, setPasswordTouched] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false)
  const [isConfirmPasswordFocused, setIsConfirmPasswordFocused] = useState(false)
  
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const password = watch("password") || ""
  const confirmPassword = watch("confirmPassword") || ""

  const passwordInputRef = useRef<HTMLInputElement>(null)
  const confirmInputRef = useRef<HTMLInputElement>(null)

  const handleBlur = (field: "password" | "confirmPassword") => {
    if (field === "password") {
      setIsPasswordFocused(false)
      setPasswordTouched(true)
    }
    if (field === "confirmPassword") {
      setIsConfirmPasswordFocused(false)
      setConfirmPasswordTouched(true)
    }
  }

  const showPasswordErrorLine = passwordTouched && !!errors.password
  const showConfirmPasswordErrorLine = confirmPasswordTouched && !!errors.confirmPassword
  const showConfirmPasswordWarning = isConfirmPasswordFocused && confirmPasswordTouched && !!errors.confirmPassword

  const rules = [
    { label: t("pwdReqLength"), valid: password.length >= 8 },
    { label: t("pwdReqNumber"), valid: /[0-9]/.test(password) },
    { label: t("pwdReqSpecial"), valid: /[^A-Za-z0-9]/.test(password) },
  ]
  const allRulesValid = rules.every((r) => r.valid)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const valid = await trigger(["password", "confirmPassword"])
    if (!valid) return
    
    setIsLoading(true)
    setServerError(null)
    
    try {
      const res = await apiFetch("/api/auth/reset-password/complete", {
        method: "POST",
        body: JSON.stringify({
          code: otp === "session" || otp === "cookie" ? undefined : otp,
          password: password,
        }),
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to reset password")
      
      setIsSuccess(true)
    } catch (err: any) {
      setServerError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const mergeRefs = (...refs: any[]) => {
    return (node: any) => {
      refs.forEach((ref) => {
        if (!ref) return
        if (typeof ref === "function") {
          ref(node)
        } else {
          ref.current = node
        }
      })
    }
  }

  const motionProps = shouldReduceMotion ? {} : {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3 }
  }

  return (
    <div className="w-full">
      {isSuccess ? (
        <motion.div {...motionProps} className="flex flex-col items-center gap-1 text-center">
            <div className="relative mb-2 flex h-12 w-12 items-center justify-center">
              <Image
                src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f973/512.webp"
                alt="🥳"
                width={48}
                height={48}
                unoptimized
                className="block h-12 w-12"
              />
            </div>
            <h1 className="text-2xl font-bold">{t("successTitle")}</h1>
            <p className="text-sm text-balance text-muted-foreground">
              {t("successSubtitle")}
            </p>
            <ShimmerButton
              className="mt-4 w-full"
              onClick={() => router.push("/login")}
            >
              {t("backToLogin")}
            </ShimmerButton>
        </motion.div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={onSubmit}
          noValidate
          aria-labelledby="reset-password-title"
          aria-busy={isLoading}
        >
            <div className="flex flex-col items-center gap-1 text-center">
              <div className="relative mb-2 flex h-12 w-12 items-center justify-center">
                <Image
                  src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f512/512.webp"
                  alt="🔒"
                  width={48}
                  height={48}
                  unoptimized
                  className="block h-12 w-12"
                />
              </div>
              <div className="flex flex-col gap-1">
                <h1 id="reset-password-title" className="text-2xl font-bold">{t("title")}</h1>
                <p className="text-sm text-balance text-muted-foreground">
                  {t("description")}
                </p>
              </div>
            </div>

            <Field key="password-field">
              <FieldLabel htmlFor="password">{t("passwordLabel")}</FieldLabel>
              <div className="flex flex-col">
                <div className="relative flex items-center">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("passwordPlaceholder")}
                    {...register("password")}
                    ref={mergeRefs(register("password").ref, passwordInputRef)}
                    onFocus={() => setIsPasswordFocused(true)}
                    onBlur={() => handleBlur("password")}
                    disabled={isLoading}
                    className="pr-10 rtl:pl-10 rtl:pr-0"
                    isError={showPasswordErrorLine}
                    autoFocus
                    autoComplete="new-password"
                    aria-describedby="password-rules-error"
                    lang="en"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground transition-colors rtl:left-0 rtl:right-auto z-10"
                    aria-label={showPassword ? t("showPassword") : t("hidePassword")}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>

                <div
                  id="password-rules-error"
                  role="alert"
                  aria-live="polite"
                  className={cn(
                    "flex flex-col gap-3 overflow-hidden transition-all duration-500 ease-in-out",
                    isPasswordFocused
                      ? "mt-3 max-h-40 opacity-100 translate-y-0"
                      : "max-h-0 opacity-0 -translate-y-2 mt-0"
                  )}
                >
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    {rules.map((rule, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex items-center gap-2 transition-colors duration-500",
                          rule.valid ? "text-emerald-600" : "text-destructive"
                        )}
                      >
                        {rule.valid ? (
                          <Check className="size-3.5 shrink-0" />
                        ) : (
                          <X className="size-3.5 shrink-0" />
                        )}
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Field>

            <Field key="confirm-password-field">
              <FieldLabel htmlFor="confirmPassword">{t("confirmPasswordLabel")}</FieldLabel>
              <div className="flex flex-col">
                <div className="relative flex items-center">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder={t("confirmPasswordPlaceholder")}
                    {...register("confirmPassword")}
                    ref={mergeRefs(register("confirmPassword").ref, confirmInputRef)}
                    onFocus={() => setIsConfirmPasswordFocused(true)}
                    onBlur={() => handleBlur("confirmPassword")}
                    disabled={isLoading || !allRulesValid}
                    className="pr-10 rtl:pl-10 rtl:pr-0"
                    isError={showConfirmPasswordErrorLine}
                    autoComplete="new-password"
                    aria-describedby="confirm-password-error"
                    lang="en"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }
                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground transition-colors rtl:left-0 rtl:right-auto z-10"
                    aria-label={showConfirmPassword ? t("showPassword") : t("hidePassword")}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="size-4" />
                      ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                <div
                  id="confirm-password-error"
                  role="alert"
                  aria-live="polite"
                  className={cn(
                    "flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out",
                    showConfirmPasswordWarning
                      ? "mt-2 max-h-10 opacity-100 translate-y-0"
                      : "max-h-0 opacity-0 -translate-y-1"
                  )}
                >
                  <X className="size-3.5 shrink-0" />
                  <span>{errors.confirmPassword?.message ? common(errors.confirmPassword.message as any) : ""}</span>
                </div>
                {/* Server-side Error Display */}
                <div
                  id="server-error"
                  role="alert"
                  aria-live="polite"
                  className={cn(
                    "flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out",
                    serverError ? "mt-2 max-h-12 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-1"
                  )}
                >
                  <X className="size-3.5 shrink-0" />
                  <span className="leading-normal">
                    {serverError && (serverError.includes(' ') ? serverError : (
                      (() => {
                        try {
                          return (common as any)(serverError)
                        } catch {
                          return serverError
                        }
                      })()
                    ))}
                  </span>
                </div>
              </div>
            </Field>

            <ShimmerButton
              type="submit"
              className="w-full"
              loading={isLoading}
              shimmerDisabled={
                !allRulesValid ||
                !!errors.confirmPassword ||
                !password ||
                !confirmPassword
              }
            >
              {t("resetButton")}
            </ShimmerButton>
        </form>
      )}
    </div>
  )
}
