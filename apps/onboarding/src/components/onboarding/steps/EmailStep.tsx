"use client";

import { useTranslations, useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createOnboardingSchema } from "@/lib/onboarding-schema";
import { useOnboarding } from "@/hooks/useOnboardingStore";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button, Input, Label } from "@nodiox/ui";
import { useEffect } from "react";
import { z } from "zod";
import { Link } from "@nodiox/i18n";

export function EmailStep() {
  const t = useTranslations("Onboarding");
  const locale = useLocale();
  const router = useRouter();
  const { state, dispatch } = useOnboarding();

  const stepSchema = z.object({
    email: createOnboardingSchema(locale).shape.email
  });

  type FormData = z.infer<typeof stepSchema>;

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(stepSchema),
    defaultValues: {
      email: state.email,
    },
  });

  useEffect(() => {
    dispatch({ type: "SET_STEP", payload: 2 });
    // Require step 1 to be done
    if (!state.fullName) {
      router.push(`/${locale}/onboarding`);
    }
  }, [dispatch, state.fullName, router, locale]);

  const onSubmit = (data: FormData) => {
    dispatch({ type: "SET_EMAIL", payload: data.email });
    router.push(`/${locale}/onboarding/verify-email`);
  };

  const getFirstName = (fullName: string) => {
    return fullName.split(" ")[0] || "there";
  };

  if (!state.fullName) return null; // Wait for redirect

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => router.push(`/${locale}/onboarding`)} className="absolute -top-12 -left-2 text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
      </button>

      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("step2Title", { firstName: getFirstName(state.fullName) })}
        </h1>
        <p className="text-sm text-muted-foreground">{t("step2Subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t("emailLabel")}</Label>
          <Input
            id="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            {...register("email")}
            className="w-full bg-background border-input focus:border-ring focus:ring-ring"
            autoFocus
          />
          {errors.email && (
            <p className="text-xs text-destructive font-medium">
              {t(errors.email.message as any)}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{t("emailPrivacyDisclaimer")}</p>

        <Button type="submit" size="xl" className="w-full mt-2">
          {t("continue")}
          <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
