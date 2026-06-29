import { cn } from "../cn";

type Status = "idle" | "working" | "review" | "active" | "error";

const statusConfig: Record<Status, { color: string; label: string; pulse: boolean }> = {
  idle: { color: "bg-[#9CA3AF]", label: "Idle", pulse: false },
  working: { color: "bg-[#3B82F6]", label: "Working", pulse: true },
  review: { color: "bg-[#F59E0B]", label: "Needs review", pulse: false },
  active: { color: "bg-[#22C55E]", label: "Active", pulse: true },
  error: { color: "bg-[#EF4444]", label: "Error", pulse: false },
};

interface StatusBadgeProps {
  status: Status;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              config.color,
            )}
          />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", config.color)} />
      </span>
      <span className="text-xs text-text-secondary">{label ?? config.label}</span>
    </div>
  );
}
