import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  currentStep: 1 | 2;
}

const STEPS: Array<{ n: 1 | 2; label: string }> = [
  { n: 1, label: "Interview" },
  { n: 2, label: "Hire" },
];

export function OnboardingStepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <ol className="flex items-center gap-3">
      {STEPS.map((step, i) => {
        const current = step.n === currentStep;
        const done = step.n < currentStep;
        return (
          <li key={step.n} className="flex items-center gap-3">
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-baseline gap-1.5 border-b-2 pb-0.5",
                current ? "border-ink" : "border-transparent",
              )}
            >
              <span className={cn("spec", current || done ? "text-ink" : "text-ink-muted")}>
                0{step.n}
              </span>
              <span
                className={cn(
                  "text-[12px]",
                  current ? "font-semibold text-ink" : done ? "text-ink" : "text-ink-muted",
                )}
              >
                {step.label}
              </span>
            </span>
            {i < STEPS.length - 1 && <span aria-hidden className="h-px w-6 bg-hairline" />}
          </li>
        );
      })}
    </ol>
  );
}
