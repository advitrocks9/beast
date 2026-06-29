"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { InterviewChat } from "./interview-chat";
import { KnowledgeSidebar } from "./knowledge-sidebar";
import { OnboardingStepIndicator } from "./step-indicator";
import { useTRPC } from "@/trpc/client";

interface CategoryProgress {
  name: string;
  filled: boolean;
}

interface OnboardingShellProps {
  companyName: string;
  initialProgress: {
    contextScore: number;
    categories: CategoryProgress[];
    totalItems: number;
    nextUnfilledCategory?: string | null;
  };
}

export function OnboardingShell({ companyName, initialProgress }: OnboardingShellProps) {
  const [progress, setProgress] = useState(initialProgress);
  const [showContinue, setShowContinue] = useState(initialProgress.contextScore >= 40);
  const [revisitTrigger, setRevisitTrigger] = useState<{ category: string; nonce: number } | null>(null);
  const router = useRouter();
  const trpc = useTRPC();
  const completeInterview = useMutation(trpc.onboarding.completeInterview.mutationOptions());
  const skipInterview = useMutation(trpc.onboarding.skipInterview.mutationOptions());

  async function handleContinue() {
    await completeInterview.mutateAsync();
    // Reload to show function mapping step
    window.location.href = "/onboarding";
  }

  async function handleSkip() {
    if (
      !confirm(
        "Skip the interview and go straight to setting up functions? You can fill in company knowledge later from /knowledge.",
      )
    ) {
      return;
    }
    await skipInterview.mutateAsync();
    window.location.href = "/onboarding";
  }

  return (
    <div className="flex h-screen bg-[#FAFAFA]">
      {/* Chat area */}
      <div className="flex flex-1 flex-col">
        {/* Minimal header */}
        <header className="flex items-center justify-between border-b border-[oklch(0.8_0.01_260/0.15)] px-6 py-3">
          <div>
            <h1 className="font-(--font-display) text-lg font-bold tracking-tight">
              Set up Beast
            </h1>
            <p className="text-xs text-text-secondary">
              Tell us about {companyName} so your AI employees can hit the ground running
            </p>
            <div className="mt-2">
              <OnboardingStepIndicator currentStep={1} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!showContinue && (
              <button
                onClick={handleSkip}
                disabled={skipInterview.isPending}
                className="text-xs text-text-muted underline-offset-4 hover:text-text-secondary hover:underline disabled:opacity-50"
              >
                {skipInterview.isPending ? "Skipping..." : "Skip and use defaults"}
              </button>
            )}
            {showContinue && (
              <button
                onClick={handleContinue}
                disabled={completeInterview.isPending}
                className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-opacity hover:bg-gray-800 disabled:opacity-50"
              >
                {completeInterview.isPending ? "Saving..." : "Continue →"}
              </button>
            )}
          </div>
        </header>

        <InterviewChat
          companyName={companyName}
          initialProgress={initialProgress}
          onProgressUpdate={setProgress}
          onReadyToContinue={() => setShowContinue(true)}
          revisitTrigger={revisitTrigger}
        />
      </div>

      {/* Knowledge sidebar */}
      <KnowledgeSidebar
        contextScore={progress.contextScore}
        categories={progress.categories}
        totalItems={progress.totalItems}
        onRevisitCategory={(category) =>
          setRevisitTrigger({ category, nonce: Date.now() })
        }
      />
    </div>
  );
}
