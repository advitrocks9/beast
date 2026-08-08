import { cn } from "@/lib/utils";

export type Provenance = "seeded" | "replay" | "simulated" | "live" | "stub";

const COPY: Record<Provenance, { label: string; title: string }> = {
  seeded: { label: "Seeded", title: "Part of the demo company's seeded history" },
  replay: { label: "Replay", title: "A recorded run, replayed at natural pace" },
  simulated: { label: "Simulated", title: "Produced by the deterministic stub provider, not a live model" },
  live: { label: "Live", title: "Running against a real model right now" },
  stub: { label: "Stub", title: "External service stubbed in the demo" },
};

export function ProvenanceTag({ kind, className }: { kind: Provenance; className?: string }) {
  const { label, title } = COPY[kind];
  return (
    <span
      title={title}
      className={cn(
        "spec-label inline-flex items-center gap-1 border border-hairline px-1.5 py-0.5",
        kind === "live" && "border-identity text-identity-deep",
        className,
      )}
    >
      {kind === "live" && (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-identity" />
      )}
      {label}
    </span>
  );
}
