"use client";

import { useTranslations, useLocale } from "next-intl";
import { useForm } from "react-hook-form"; // Will use react-hook-form appropriately
import { zodResolver } from "@hookform/resolvers/zod";
import { createOnboardingSchema } from "@/lib/onboarding-schema";
import { useOnboarding } from "@/hooks/useOnboardingStore";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button, Input, Label } from "@nodiox/ui";
import { useEffect } from "react";
import { z } from "zod";

export function FullNameStep({ firstName = "Friend" }: { firstName?: string }) {
  const t = useTranslations("Onboarding");
  const locale = useLocale();
  const router = useRouter();
  const { state, dispatch } = useOnboarding();

  // Create isolated schema just for this step
  const stepSchema = z.object({
    fullName: createOnboardingSchema(locale).shape.fullName
  });

  type FormData = z.infer<typeof stepSchema>;

  const { register, handleSubmit, formState: { errors }, setValue } = useForm<FormData>({
    resolver: zodResolver(stepSchema),
    defaultValues: {
      fullName: state.fullName,
    },
  });

  useEffect(() => {
    dispatch({ type: "SET_STEP", payload: 1 });
  }, [dispatch]);

  const onSubmit = (data: FormData) => {
    dispatch({ type: "SET_FULL_NAME", payload: data.fullName });
    router.push(`/${locale}/onboarding/email`);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("step1Title", { firstName })}</h1>
        <p className="text-sm text-muted-foreground">{t("step1Subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">{t("fullNameLabel")}</Label>
          <Input
            id="fullName"
            placeholder={t("fullNamePlaceholder")}
            {...register("fullName")}
            className="w-full bg-background border-input focus:border-ring focus:ring-ring"
            autoFocus
          />
          {errors.fullName && (
            <p className="text-xs text-destructive font-medium">
              {t(errors.fullName.message as any)}
            </p>
          )}
        </div>

        <Button type="submit" size="xl" className="w-full">
          {t("continue")}
          <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
