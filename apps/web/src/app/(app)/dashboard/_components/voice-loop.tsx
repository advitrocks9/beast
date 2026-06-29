import { GlassCard } from "@beast/ui";

export interface VoiceLoopData {
  employeeName: string;
  feedback: string;
  feedbackSource: string;
  ruleTitle: string;
  example: string;
  appliedCount: number;
  approvalDelta: number;
}

export function VoiceLoop({ data }: { data: VoiceLoopData }) {
  const steps = [
    {
      label: "You approved",
      body: (
        <>
          <span className="text-text">{"“"}{data.feedback}{"”"}</span>
          <span className="text-text-muted"> on {data.feedbackSource}</span>
        </>
      ),
    },
    {
      label: `${data.employeeName} learned a rule`,
      body: (
        <>
          <span className="text-text">{data.ruleTitle}.</span>
          <span className="text-text-secondary"> Now writes things like {"“"}{data.example}{"”"}</span>
        </>
      ),
    },
    {
      label: "Since then",
      body: (
        <span className="text-text-secondary">
          applied in <span className="font-medium text-text">{data.appliedCount}</span> deliverables
          {data.approvalDelta > 0 && (
            <>
              {" "}· approval{" "}
              <span className="font-medium" style={{ color: "var(--color-active)" }}>
                +{Math.round(data.approvalDelta * 100)}%
              </span>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <GlassCard hoverable={false} className="p-5">
      <h3 className="text-sm font-semibold">How {data.employeeName} learns your voice</h3>
      <p className="text-xs text-text-secondary">
        Every edit and approval becomes a rule the next draft applies.
      </p>
      <ol className="mt-4 space-y-0">
        {steps.map((step, i) => (
          <li key={i} className="grid grid-cols-[auto_1fr] gap-x-3">
            <div className="flex flex-col items-center">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-light font-mono text-[10px] font-medium text-brand-deep">
                {i + 1}
              </span>
              {i < steps.length - 1 && <span className="my-1 w-px flex-1 bg-border" style={{ minHeight: 16 }} />}
            </div>
            <div className="pb-4 text-sm leading-relaxed">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {step.label}
              </div>
              <div className="mt-0.5">{step.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </GlassCard>
  );
}
