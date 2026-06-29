import { cn } from "../cn";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "sidebar" | "overlay";
}

export function GlassPanel({ variant = "sidebar", className, children, ...props }: GlassPanelProps) {
  return (
    <div
      className={cn(
        variant === "sidebar" && [
          "bg-[oklch(1_0_0/0.6)] backdrop-blur-[16px] backdrop-saturate-[1.2]",
          "border-r border-[oklch(0.8_0.01_260/0.15)]",
        ],
        variant === "overlay" && [
          "bg-[oklch(1_0_0/0.4)] backdrop-blur-[32px] backdrop-saturate-[1.2]",
          "border border-[oklch(0.8_0.01_260/0.1)]",
          "rounded-[20px]",
        ],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
