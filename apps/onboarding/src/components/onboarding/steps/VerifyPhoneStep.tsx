"use client";

import { useTranslations, useLocale } from "next-intl";
import { useOnboarding } from "@/hooks/useOnboardingStore";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@nodiox/ui";
import { useEffect, useState, useRef } from "react";
import { Link } from "@nodiox/i18n";

export function VerifyPhoneStep() {
  const t = useTranslations("Onboarding");
  const locale = useLocale();
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(60);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    dispatch({ type: "SET_STEP", payload: 5 });
    if (!state.phoneNumber) {
      router.push(`/${locale}/onboarding/phone`);
    }
  }, [dispatch, state.phoneNumber, router, locale]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      const pastedCode = value.slice(0, 6).split("");
      const newCode = [...code];
      pastedCode.forEach((char, i) => {
        if (index + i < 6 && /^[0-9]$/.test(char)) {
          newCode[index + i] = char;
        }
      });
      setCode(newCode);
      const nextIndex = Math.min(index + pastedCode.length, 5);
      inputs.current[nextIndex]?.focus();
    } else if (/^[0-9]?$/.test(value)) {
      const newCode = [...code];
      newCode[index] = value;
      setCode(newCode);
      setError(false);

      if (value !== "" && index < 5) {
        inputs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && index > 0 && code[index] === "") {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError(true);
      return;
    }

    setIsLoading(true);
    // Simulate backend verification
    setTimeout(() => {
      setIsLoading(false);
      if (fullCode === "123456") {
        setError(true);
      } else {
        dispatch({ type: "SET_PHONE_VERIFIED", payload: true });
        router.push(`/${locale}/onboarding/password`);
      }
    }, 1000);
  };

  const handleResend = () => {
    if (timer === 0) {
      setTimer(60);
      setCode(["", "", "", "", "", ""]);
      setError(false);
      inputs.current[0]?.focus();
    }
  };

  const getFirstName = (fullName: string) => {
    return fullName.split(" ")[0] || "there";
  };

  if (!state.phoneNumber) return null;

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => router.push(`/${locale}/onboarding/phone`)} className="absolute -top-12 -left-2 text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
      </button>

      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("step5Title", { firstName: getFirstName(state.fullName) })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("step5Subtitle", { phoneNumber: state.phoneNumber })}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="flex justify-between gap-2 max-w-[320px] mx-auto">
          {code.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => { inputs.current[idx] = el; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={digit}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className={`w-12 h-14 text-center text-2xl font-semibold bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                error ? "border-destructive text-destructive" : "border-input text-foreground"
              }`}
              aria-label={t("otpDigitLabel", { index: idx + 1 })}
            />
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive text-center font-medium">
            {t("invalidOtpCode")}
          </p>
        )}

        <Button 
          type="submit" 
          size="xl"
          className="w-full mt-4"
          disabled={code.join("").length !== 6 || isLoading}
        >
          {isLoading ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : null}
          {t("verify")}
        </Button>
      </form>

      <div className="text-center mt-6">
        <p className="text-sm text-muted-foreground">
          {t("didntGetCode")}{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={timer > 0}
            className={`font-medium ${
              timer > 0 ? "text-muted-foreground cursor-not-allowed" : "text-foreground hover:underline"
            }`}
          >
            {timer > 0 ? `${t("resendIn")} ${timer}s` : t("resendCode")}
          </button>
        </p>
      </div>
    </div>
  );
}
