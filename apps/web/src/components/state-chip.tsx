import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/colors";

export function RegisterMark({ size = 10, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className={cn("register-mark shrink-0", className)}
    >
      <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6 0v2.5M6 9.5V12M0 6h2.5M9.5 6H12"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function StateChip({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const meta = statusMeta(status);
  const running = status === "running";
  return (
    <span
      className={cn(
        "chip",
        meta.mode === "struck" && "line-through decoration-[1px]",
        className,
      )}
      style={
        meta.mode === "solid"
          ? { backgroundColor: meta.bg, color: meta.fg }
          : { borderColor: meta.dot, color: meta.fg }
      }
    >
      {running && <RegisterMark size={10} />}
      {label ?? meta.label}
    </span>
  );
}
