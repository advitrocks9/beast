"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
  const trpc = useTRPC();
  const completeInterview = useMutation(trpc.onboarding.completeInterview.mutationOptions());
  const skipInterview = useMutation(trpc.onboarding.skipInterview.mutationOptions());

  async function handleContinue() {
    await completeInterview.mutateAsync();
    window.location.href = "/onboarding";
  }

  async function handleSkip() {
    if (
      !confirm(
        "Skip the interview and go straight to hiring? You can fill in company knowledge later from /knowledge.",
      )
    ) {
      return;
    }
    await skipInterview.mutateAsync();
    window.location.href = "/onboarding";
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="rule-b flex flex-wrap items-end justify-between gap-3 px-6 pt-5 pb-4">
        <div>
          <p className="spec-label">Beast · founding paperwork</p>
          <h1 className="display-caps mt-1 text-2xl">Founding interview</h1>
          <p className="spec mt-1.5 text-ink-muted">
            {companyName} · context {progress.contextScore}/100
          </p>
          <div className="mt-2.5">
            <OnboardingStepIndicator currentStep={1} />
          </div>
        </div>
        <div className="flex items-center gap-3 pb-0.5">
          {!showContinue && (
            <button
              onClick={handleSkip}
              disabled={skipInterview.isPending}
              className="spec-label transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50"
            >
              {skipInterview.isPending ? "Skipping…" : "Skip, use defaults"}
            </button>
          )}
          {showContinue && (
            <button
              onClick={handleContinue}
              disabled={completeInterview.isPending}
              className="btn-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50"
            >
              {completeInterview.isPending ? "Filing…" : "Continue to hiring"}
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <InterviewChat
            companyName={companyName}
            initialProgress={initialProgress}
            onProgressUpdate={setProgress}
            onReadyToContinue={() => setShowContinue(true)}
            revisitTrigger={revisitTrigger}
          />
        </div>

        <KnowledgeSidebar
          contextScore={progress.contextScore}
          categories={progress.categories}
          totalItems={progress.totalItems}
          onRevisitCategory={(category) =>
            setRevisitTrigger({ category, nonce: Date.now() })
          }
        />
      </div>
    </div>
  );
}
