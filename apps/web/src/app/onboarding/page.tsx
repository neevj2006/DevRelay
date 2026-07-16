import { Brand } from "@/components/brand";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { ThemeSelector } from "@/components/theme-selector";

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <ThemeSelector />
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl justify-center px-4 py-12 sm:px-6 sm:py-16">
        <OnboardingFlow />
      </main>
    </div>
  );
}
