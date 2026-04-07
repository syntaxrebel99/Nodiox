"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslations } from "next-intl"
import { cn } from "@nodiox/utils"
import { Phone, Mail, X, Eye, EyeOff } from "lucide-react"
import { ShimmerButton, Checkbox, Label, Button, Input, Field, FieldGroup, FieldLabel, FieldSeparator, FieldDescription } from "@nodiox/ui"
import { Link } from "@nodiox/i18n"
import Image from "next/image"
import { type LoginData } from "~/lib/login-schema"
import { AnimatePresence, motion } from "framer-motion"
import { LoginMethodEmail } from "./login-method-email"
import { LoginMethodPhone } from "./login-method-phone"

const METHOD_STORAGE_KEY = "nodiox_login_method"

interface Step1CredentialsProps {
  onNext: () => void;
  isLoading: boolean;
  serverError: string | null;
  setServerError: (error: string | null) => void;
}

export function Step1Credentials({ onNext, isLoading, serverError, setServerError }: Step1CredentialsProps) {
  const t = useTranslations("Index")
  const [isWaving, setIsWaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const { register, watch, setValue, clearErrors, formState: { errors } } = useFormContext<LoginData>()
  const loginMethod = watch("loginMethod")

  // Persistence of login method
  useEffect(() => {
    const saved = sessionStorage.getItem(METHOD_STORAGE_KEY)
    if (saved === "email" || saved === "phone") {
      setValue("loginMethod", saved as "email" | "phone")
    }
  }, [setValue])

  useEffect(() => {
    sessionStorage.setItem(METHOD_STORAGE_KEY, loginMethod)
  }, [loginMethod])

  useEffect(() => {
    const interval = setInterval(() => {
      setIsWaving((prev) => !prev)
    }, 3000)
    setIsWaving(true)
    return () => clearInterval(interval)
  }, [])

  const toggleLoginMethod = () => {
    const nextMethod = loginMethod === "email" ? "phone" : "email"
    setValue("loginMethod", nextMethod)
    clearErrors(loginMethod === "email" ? "email" : "phoneNumber")
    setServerError(null)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-6"
    >
      {/* Header */}
      <div className="flex flex-col items-center gap-1 text-center text-balance">
        <div className="relative mb-2 flex h-12 w-12 items-center justify-center">
          <Image
            src={
              isWaving
                ? "https://fonts.gstatic.com/s/e/notoemoji/latest/1f44b_1f3fb/512.gif"
                : "https://fonts.gstatic.com/s/e/notoemoji/latest/1f44b_1f3fb/512.png"
            }
            alt="👋"
            width={48}
            height={48}
            unoptimized={isWaving}
            className="block h-12 w-12 cursor-pointer"
            onMouseEnter={() => setIsWaving(true)}
            onMouseLeave={() => setIsWaving(false)}
          />
        </div>
        <h1 className="text-2xl font-bold">
          {t("title")}
        </h1>
        <p className="text-sm text-balance text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <div className="relative overflow-visible">
        <AnimatePresence mode="wait" initial={false}>
          {loginMethod === "email" ? (
            <LoginMethodEmail isLoading={isLoading} serverError={serverError} />
          ) : (
            <LoginMethodPhone isLoading={isLoading} serverError={serverError} />
          )}
        </AnimatePresence>
      </div>

      {/* Password field */}
      <Field>
        <FieldLabel htmlFor="password">{t("passwordLabel")}</FieldLabel>
        <div className="flex flex-col">
          <div className="relative flex items-center">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={t("passwordPlaceholder")}
              {...register("password")}
              onFocus={() => setServerError(null)}
              disabled={isLoading}
              className="pr-10 rtl:pl-10 rtl:pr-0"
              isError={!!errors.password || !!serverError}
              aria-describedby="password-error"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 rtl:left-0 rtl:right-auto text-muted-foreground hover:text-foreground inline-flex items-center justify-center p-2 z-10"
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <div
            id="password-error"
            role="alert"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs text-destructive overflow-hidden transition-all duration-300 ease-in-out",
              errors.password || serverError
                ? "mt-2 max-h-10 opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-1"
            )}
          >
            <X className="size-3.5 shrink-0" />
            <span>
              {serverError === "invalid_credentials" 
                ? t("errorInvalidCredentials") 
                : serverError === "server_error"
                ? t("server_error")
                : serverError 
                ? serverError.toString() // Render the raw error string from the API
                : (errors.password?.message ? t(errors.password.message as any) : "")}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Checkbox 
              id="rememberMe" 
              {...register("rememberMe")}
              onCheckedChange={(checked) => setValue("rememberMe", !!checked)}
              disabled={isLoading} 
            />
            <Label htmlFor="rememberMe">{t("rememberMe")}</Label>
          </div>
          <Link
            href="/forgot-password"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("forgotPassword")}
          </Link>
        </div>
      </Field>

      <div className="flex flex-col gap-3">
        <ShimmerButton
          type="submit"
          className="w-full"
          loading={isLoading}
        >
          {t("login")}
        </ShimmerButton>
 
        <FieldSeparator className="!my-0">{t("orContinueWith")}</FieldSeparator>
 
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            type="button"
            className="w-full"
            disabled={isLoading}
            onClick={toggleLoginMethod}
          >
            {loginMethod === "email" ? (
              <>
                <Phone className="mr-2 h-4 w-4" />
                {t("loginWithPhone")}
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                {t("loginWithEmail")}
              </>
            )}
          </Button>
 
          <FieldDescription className="text-center text-sm">
            {t("noAccount")}{" "}
            <Link href="/signup" className="text-primary hover:underline underline-offset-4">
              {t("signUp")}
            </Link>
          </FieldDescription>
        </div>
      </div>
    </motion.div>
  )
}
