"use client";

import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useOnboarding, OnboardingProvider } from "@/hooks/useOnboardingStore";

const TOTAL_STEPS = 7;

function ProgressIndicator() {
  const { state } = useOnboarding();
  const currentStep = state.currentStep;

  // Render a continuous progress bar
  const progressPercent = Math.min(100, Math.max(0, ((currentStep - 1) / (TOTAL_STEPS - 1)) * 100));

  return (
    <div className="w-full max-w-sm mx-auto mb-8 px-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          Step {currentStep} of {TOTAL_STEPS}
        </span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-white rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}

function ShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  
  return (
    <div className="w-full max-w-md mx-auto pt-16 pb-8 px-6 flex-1 flex flex-col justify-center">
      <div className="relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 15, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -15, filter: "blur(4px)" }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <OnboardingProvider>
      <ShellContent>{children}</ShellContent>
    </OnboardingProvider>
  );
}
