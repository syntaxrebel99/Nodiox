"use client";

import { useTranslations, useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createOnboardingSchema } from "@/lib/onboarding-schema";
import { useOnboarding } from "@/hooks/useOnboardingStore";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X, Eye, EyeOff } from "lucide-react";
import { Button, Input, Label } from "@nodiox/ui";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Link } from "@nodiox/i18n";

export function PasswordStep() {
  const t = useTranslations("Onboarding");
  const locale = useLocale();
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // We extract the password logic from the main schema to reuse Zod's validation
  const fullSchema = createOnboardingSchema(locale);
  const stepSchema = z.object({
    password: fullSchema.shape.password,
    confirmPassword: fullSchema.shape.confirmPassword,
  }).refine((data) => data.password === data.confirmPassword, {
    message: "passwordsMustMatch",
    path: ["confirmPassword"],
  });

  type FormData = z.infer<typeof stepSchema>;

  const { register, handleSubmit, formState: { errors }, watch } = useForm<FormData>({
    resolver: zodResolver(stepSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const watchPassword = watch("password");

  useEffect(() => {
    dispatch({ type: "SET_STEP", payload: 6 });
    if (!state.emailVerified) {
      router.push(`/${locale}/onboarding/verify-email`);
    }
  }, [dispatch, state.emailVerified, router, locale]);

  const onSubmit = (data: FormData) => {
    // We do NOT store the password in global state or session storage for security.
    router.push(`/${locale}/onboarding/welcome`);
  };

  const rules = [
    { label: t("pwdReqLength"), valid: watchPassword?.length >= 8 },
    { label: t("pwdReqNumber"), valid: /[A-Z]/.test(watchPassword || "") && /[a-z]/.test(watchPassword || "") },
    { label: t("pwdReqSpecial"), valid: /\d/.test(watchPassword || "") && /[^A-Za-z0-9]/.test(watchPassword || "") },
  ];

  if (!state.emailVerified) return null;

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => router.push(`/${locale}${state.phoneVerified ? '/onboarding/phone' : '/onboarding/verify-email'}`)} className="absolute -top-12 -left-2 text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
      </button>

      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("step6Title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("step6Subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2 relative">
          <Label htmlFor="password">{t("passwordLabel")}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={t("passwordPlaceholder")}
              {...register("password")}
              className="w-full bg-background border-input pr-10 focus:border-neutral-700 focus:ring-neutral-700"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-destructive font-medium">
              {t(errors.password.message as any)}
            </p>
          )}
        </div>

        <div className="space-y-2 relative">
          <Label htmlFor="confirmPassword">{t("confirmPasswordLabel")}</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder={t("confirmPasswordPlaceholder")}
              {...register("confirmPassword")}
              className="w-full bg-background border-input pr-10 focus:border-neutral-700 focus:ring-neutral-700"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-destructive font-medium">
              {t(errors.confirmPassword.message as any)}
            </p>
          )}
        </div>

        <div className="pt-2 space-y-2">
          {rules.map((rule, idx) => (
            <div key={idx} className="flex items-center space-x-2 text-sm">
              {rule.valid ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <X className="w-4 h-4 text-muted-foreground" />
              )}
              <span className={rule.valid ? "text-neutral-300" : "text-muted-foreground"}>
                {rule.label}
              </span>
            </div>
          ))}
        </div>

        <Button type="submit" size="xl" className="w-full mt-6">
          {t("continue")}
          <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
