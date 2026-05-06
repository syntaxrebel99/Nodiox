"use client";

import { useTranslations, useLocale } from "next-intl";
import { useOnboarding } from "@/hooks/useOnboardingStore";
import { useEffect } from "react";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@nodiox/ui";

export function WelcomeStep() {
  const t = useTranslations("Onboarding");
  const locale = useLocale();
  const { state, dispatch } = useOnboarding();

  useEffect(() => {
    dispatch({ type: "SET_STEP", payload: 7 });
    
    // Trigger confetti
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);

    return () => clearInterval(interval);
  }, [dispatch]);

  const getFirstName = (fullName: string) => {
    return fullName.split(" ")[0] || "";
  };

  const handleFinish = () => {
    // In actual implementation, this will navigate to the dashboard (localhost:3002 or auth app's callback)
    // For now we simulate an absolute redirect
    dispatch({ type: "RESET" }); // Clear session storage
    window.location.href = `http://localhost:3002/${locale}/app`;
  };

  return (
    <div className="flex flex-col items-center justify-center text-center space-y-8 py-8">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center"
      >
        <CheckCircle2 className="w-12 h-12 text-green-500" />
      </motion.div>

      <div className="space-y-4 max-w-sm">
        <motion.h1 
          className="text-3xl font-semibold tracking-tight text-foreground"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {t("step7Title", { firstName: getFirstName(state.fullName) })}
        </motion.h1>
        <motion.p 
          className="text-muted-foreground"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {t("step7Subtitle")}
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="pt-8 w-full"
      >
        <Button 
          onClick={handleFinish}
          size="xl"
          className="w-full"
        >
          {t("goToDashboard")}
          <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </motion.div>
    </div>
  );
}
