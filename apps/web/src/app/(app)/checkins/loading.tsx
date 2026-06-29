import { GlassCard } from "@beast/ui";

export default function CheckinsLoading() {
  return (
    <div className="space-y-8">
      <div>
        <div className="h-8 w-36 animate-pulse rounded-md bg-[oklch(0.92_0.01_260)]" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded-md bg-[oklch(0.94_0.01_260)]" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <GlassCard key={i} hoverable={false} className="flex items-center gap-4 p-4">
            <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[oklch(0.92_0.01_260)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded-md bg-[oklch(0.92_0.01_260)]" />
              <div className="h-3 w-1/2 animate-pulse rounded-md bg-[oklch(0.94_0.01_260)]" />
            </div>
            <div className="h-5 w-20 animate-pulse rounded-full bg-[oklch(0.94_0.01_260)]" />
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
