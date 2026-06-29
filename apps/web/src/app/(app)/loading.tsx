import { GlassCard } from "@beast/ui";

export default function AppLoading() {
  return (
    <div className="space-y-8">
      <div>
        <div className="h-8 w-48 animate-pulse rounded-md bg-[oklch(0.92_0_0)]" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded-md bg-[oklch(0.94_0_0)]" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <GlassCard key={i} hoverable={false} className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 animate-pulse rounded-full bg-[oklch(0.92_0_0)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded-md bg-[oklch(0.92_0_0)]" />
                <div className="h-3 w-1/2 animate-pulse rounded-md bg-[oklch(0.94_0_0)]" />
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <div className="h-3 w-full animate-pulse rounded-md bg-[oklch(0.94_0_0)]" />
              <div className="h-3 w-5/6 animate-pulse rounded-md bg-[oklch(0.94_0_0)]" />
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
