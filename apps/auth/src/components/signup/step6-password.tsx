import * as React from "react"
import { useState } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslations } from "next-intl"
import Image from "next/image"
import { cn } from "@nodiox/utils"
import { X, Check, Eye, EyeOff } from "lucide-react"
import { Field, FieldLabel, Input, ShimmerButton } from "@nodiox/ui"
import { type OnboardingData } from "~/lib/onboarding-schema"
type AuthError = string;

import { motion, useReducedMotion } from "framer-motion"

interface Step6PasswordProps {
  onBack: () => void;
  isLoading: boolean;
  serverError: AuthError | null;
  setServerError: React.Dispatch<React.SetStateAction<AuthError | null>>;
}

export function Step6Password({ onBack, isLoading, serverError, setServerError }: Step6PasswordProps) {
  const o = useTranslations("Onboarding")
  const { register, watch, formState: { errors } } = useFormContext<OnboardingData>()

  const shouldReduceMotion = useReducedMotion()

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [passwordTouched, setPasswordTouched] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false)
  const [isConfirmPasswordFocused, setIsConfirmPasswordFocused] = useState(false)

  const password = watch("password") || ""
  const confirmPassword = watch("confirmPassword") || ""

  const handleBlur = (field: "password" | "confirmPassword") => {
    if (field === "password") { setIsPasswordFocused(false); setPasswordTouched(true) }
    if (field === "confirmPassword") { setIsConfirmPasswordFocused(false); setConfirmPasswordTouched(true) }
  }

  const showPasswordErrorLine = passwordTouched && !!errors.password
  const showConfirmPasswordErrorLine = confirmPasswordTouched && !!errors.confirmPassword
  const showConfirmPasswordWarning = isConfirmPasswordFocused && confirmPasswordTouched && !!errors.confirmPassword

  const rules = [
    { label: o("pwdReqLength"), valid: password.length >= 8 },
    { label: o("pwdReqNumber"), valid: /[0-9]/.test(password) },
    { label: o("pwdReqSpecial"), valid: /[^A-Za-z0-9]/.test(password) },
  ]
  const allRulesValid = rules.every((r) => r.valid)

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (serverError) setServerError(null)
  }

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
            src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f510/512.webp"
            alt="🔒"
            width={48}
            height={48}
            unoptimized
            className="block h-12 w-12"
          />
        </div>
        <h1 className="text-2xl font-bold">
          {o("step6Title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {o("step6Subtitle")}
        </p>
      </div>

      <Field key="password-field">
        <FieldLabel htmlFor="password">{o("passwordLabel")}</FieldLabel>
        <div className="flex flex-col">
          <div className="relative flex items-center">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={o("passwordPlaceholder")}
              {...register("password")}
              onChange={(e) => {
                register("password").onChange(e);
                handlePasswordChange(e);
              }}
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
              className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground transition-colors rtl:left-0 rtl:right-auto"
              aria-label={showPassword ? o("hidePassword") : o("showPassword")}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
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
        <FieldLabel htmlFor="confirmPassword">{o("confirmPasswordLabel")}</FieldLabel>
        <div className="flex flex-col">
          <div className="relative flex items-center">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder={o("confirmPasswordPlaceholder")}
              {...register("confirmPassword")}
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
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground transition-colors rtl:left-0 rtl:right-auto"
              aria-label={showConfirmPassword ? o("hidePassword") : o("showPassword" as any)}
            >
              {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
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
            <span>{errors.confirmPassword?.message ? o(errors.confirmPassword.message as any) : ""}</span>
          </div>
          <div
            id="signup-server-error"
            role="alert"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out",
              serverError
                ? "mt-2 max-h-10 opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <X className="size-3.5 shrink-0" />
            <span>{serverError && (o.has(serverError as any) ? o(serverError as any) : serverError)}</span>
          </div>
        </div>
      </Field>

      <div className="flex flex-col gap-2">
        <ShimmerButton
          type="submit"
          className="w-full"
          loading={isLoading}
          shimmerDisabled={!allRulesValid || !!errors.confirmPassword || !password || !confirmPassword}
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
