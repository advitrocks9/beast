import { cn } from "@/lib/utils";
import { roleMeta } from "@/lib/colors";

const SIZES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-[12px]",
  lg: "h-10 w-10 text-[14px]",
  xl: "h-14 w-14 text-[19px]",
} as const;

export function Monogram({
  name,
  roleType,
  size = "md",
  className,
}: {
  name: string;
  roleType?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const meta = roleMeta(roleType);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-[2px] font-mono font-normal uppercase text-white",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: meta.solid }}
    >
      {name.slice(0, 2)}
    </span>
  );
}
