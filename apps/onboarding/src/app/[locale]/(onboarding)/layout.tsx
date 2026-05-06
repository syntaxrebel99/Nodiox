import { AppSettings } from "@nodiox/ui";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-white dark:bg-black text-foreground">
      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-10">
        <OnboardingShell>{children}</OnboardingShell>
      </main>

      {/* Footer Settings */}
      <footer className="p-6 flex justify-center z-10 mt-auto relative">
        <AppSettings />
      </footer>
    </div>
  );
}
