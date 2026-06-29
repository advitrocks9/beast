import { cn } from "../cn";

interface GlassNavProps extends React.HTMLAttributes<HTMLElement> {
  sticky?: boolean;
}

export function GlassNav({ sticky = true, className, children, ...props }: GlassNavProps) {
  return (
    <nav
      className={cn(
        "bg-[oklch(1_0_0/0.6)] backdrop-blur-[16px] backdrop-saturate-[1.2]",
        "border-b border-[oklch(0.8_0.01_260/0.15)]",
        sticky && "sticky top-0 z-50",
        className,
      )}
      {...props}
    >
      {children}
    </nav>
  );
}
