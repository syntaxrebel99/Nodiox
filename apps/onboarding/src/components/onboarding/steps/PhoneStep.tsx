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

export function PhoneStep() {
  const t = useTranslations("Onboarding");
  const locale = useLocale();
  const router = useRouter();
  const { state, dispatch } = useOnboarding();

  const stepSchema = z.object({
    phoneNumber: createOnboardingSchema(locale).shape.phoneNumber
  });

  type FormData = z.infer<typeof stepSchema>;

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(stepSchema),
    defaultValues: {
      phoneNumber: state.phoneNumber,
    },
  });

  useEffect(() => {
    dispatch({ type: "SET_STEP", payload: 4 });
    if (!state.emailVerified) {
      router.push(`/${locale}/onboarding/verify-email`);
    }
  }, [dispatch, state.emailVerified, router, locale]);

  const onSubmit = (data: FormData) => {
    if (data.phoneNumber && data.phoneNumber.trim() !== "") {
      dispatch({ type: "SET_PHONE", payload: data.phoneNumber });
      router.push(`/${locale}/onboarding/verify-phone`);
    } else {
      // Optional, so skip to password
      router.push(`/${locale}/onboarding/password`);
    }
  };

  const getFirstName = (fullName: string) => {
    return fullName.split(" ")[0] || "there";
  };

  const handleSkip = () => {
    router.push(`/${locale}/onboarding/password`);
  };

  if (!state.emailVerified) return null;

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => router.push(`/${locale}/onboarding/verify-email`)} className="absolute -top-12 -left-2 text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
      </button>

      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("step4Title", { firstName: getFirstName(state.fullName) })}
        </h1>
        <p className="text-sm text-muted-foreground">{t("step4Subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phoneNumber">{t("phoneLabel")}</Label>
          <Input
            id="phoneNumber"
            type="tel"
            placeholder={t("phonePlaceholder")}
            {...register("phoneNumber")}
            className="w-full bg-background border-input focus:border-ring focus:ring-ring"
            autoFocus
          />
          {errors.phoneNumber && (
            <p className="text-xs text-destructive font-medium">
              {t(errors.phoneNumber.message as any)}
            </p>
          )}
        </div>

        <div className="flex gap-3 mt-4">
          <Button type="button" variant="outline" size="xl" onClick={handleSkip} className="flex-1">
            Skip
          </Button>
          <Button type="submit" size="xl" className="flex-1">
            {t("continue")}
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
