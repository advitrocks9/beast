import { GlassCard } from "@beast/ui";

export default function GoalsLoading() {
  return (
    <div className="space-y-8">
      <div>
        <div className="h-8 w-32 animate-pulse rounded-md bg-[oklch(0.92_0_0)]" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded-md bg-[oklch(0.94_0_0)]" />
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <GlassCard key={i} hoverable={false} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-5 w-2/3 animate-pulse rounded-md bg-[oklch(0.92_0_0)]" />
                <div className="h-3 w-1/3 animate-pulse rounded-md bg-[oklch(0.94_0_0)]" />
              </div>
              <div className="h-5 w-16 animate-pulse rounded-full bg-[oklch(0.94_0_0)]" />
            </div>
            <div className="mt-5 h-2 w-full animate-pulse rounded-full bg-[oklch(0.94_0_0)]" />
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
