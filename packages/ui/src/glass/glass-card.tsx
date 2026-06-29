import { cn } from "../cn";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "light" | "heavy" | "frosted" | "accent";
  hoverable?: boolean;
}

const variants = {
  light: "bg-[oklch(1_0_0/0.55)] backdrop-blur-[20px] backdrop-saturate-[1.2]",
  heavy: "bg-[oklch(1_0_0/0.7)] backdrop-blur-[24px] backdrop-saturate-[1.2]",
  frosted: "bg-[oklch(1_0_0/0.4)] backdrop-blur-[32px] backdrop-saturate-[1.2]",
  accent: "bg-[oklch(0.58_0.16_260/0.08)] backdrop-blur-[24px] backdrop-saturate-[1.2]",
};

export function GlassCard({
  variant = "light",
  hoverable = true,
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        variants[variant],
        "rounded-[20px] border border-[oklch(0.8_0.01_260/0.15)]",
        "shadow-[0_4px_16px_oklch(0.3_0.02_260/0.05),inset_0_1px_0_oklch(1_0_0/0.2)]",
        hoverable && [
          "transition-all duration-150",
          "hover:bg-[oklch(1_0_0/0.65)]",
          "hover:border-[oklch(0.8_0.01_260/0.2)]",
          "hover:shadow-[0_8px_24px_oklch(0.3_0.02_260/0.08),inset_0_1px_0_oklch(1_0_0/0.25)]",
        ],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
