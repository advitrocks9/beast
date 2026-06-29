import { cn } from "../cn";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "light" | "heavy" | "frosted" | "accent";
  hoverable?: boolean;
}

// Solid cards on the warm paper canvas: depth comes from a real hairline + lift,
// not translucency that vanished on white. "frosted" keeps true glass for the
// few over-imagery / nav surfaces; "accent" is a brand-tinted panel.
const variants = {
  light: "bg-white",
  heavy: "bg-white",
  frosted: "bg-[oklch(1_0_0/0.6)] backdrop-blur-[28px] backdrop-saturate-[1.2]",
  accent: "bg-brand-light",
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
        "rounded-[20px] border border-border shadow-sm",
        hoverable && [
          "transition-all duration-150",
          "hover:-translate-y-px hover:shadow-md",
          "hover:border-[oklch(0.83_0.008_70/0.9)]",
        ],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
