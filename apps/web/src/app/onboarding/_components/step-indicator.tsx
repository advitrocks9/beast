interface StepIndicatorProps {
  currentStep: 1 | 2 | 3;
}

const STEPS: Array<{ n: 1 | 2 | 3; label: string }> = [
  { n: 1, label: "Interview" },
  { n: 2, label: "Functions" },
  { n: 3, label: "Hire" },
];

export function OnboardingStepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <ol className="flex items-center gap-1.5">
      {STEPS.map((step, i) => {
        const status: "done" | "current" | "upcoming" =
          step.n < currentStep
            ? "done"
            : step.n === currentStep
              ? "current"
              : "upcoming";
        const isLast = i === STEPS.length - 1;
        return (
          <li key={step.n} className="flex items-center gap-1.5">
            <span
              className={
                status === "done"
                  ? "flex h-5 w-5 items-center justify-center rounded-full bg-text text-[10px] font-bold text-white"
                  : status === "current"
                    ? "flex h-5 w-5 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white"
                    : "flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white text-[10px] font-medium text-text-muted"
              }
              aria-current={status === "current" ? "step" : undefined}
            >
              {status === "done" ? "✓" : step.n}
            </span>
            <span
              className={
                status === "current"
                  ? "text-xs font-semibold text-text"
                  : "text-xs text-text-muted"
              }
            >
              {step.label}
            </span>
            {!isLast && (
              <span
                aria-hidden
                className="ml-1 h-px w-5 bg-[oklch(0.8_0.01_260/0.4)]"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
