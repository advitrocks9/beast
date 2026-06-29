import { GlassCard } from "@beast/ui";

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div>
        <div className="h-8 w-72 animate-pulse rounded-md bg-[oklch(0.92_0.01_260)]" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded-md bg-[oklch(0.94_0.01_260)]" />
      </div>

      <GlassCard hoverable={false} className="p-6">
        <div className="h-5 w-40 animate-pulse rounded-md bg-[oklch(0.92_0.01_260)]" />
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-7 w-12 animate-pulse rounded-md bg-[oklch(0.92_0.01_260)]" />
              <div className="h-3 w-20 animate-pulse rounded-md bg-[oklch(0.94_0.01_260)]" />
            </div>
          ))}
        </div>
      </GlassCard>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="h-5 w-28 animate-pulse rounded-md bg-[oklch(0.92_0.01_260)]" />
          <div className="h-3 w-16 animate-pulse rounded-md bg-[oklch(0.94_0.01_260)]" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <GlassCard key={i} hoverable={false} className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-[oklch(0.92_0.01_260)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded-md bg-[oklch(0.92_0.01_260)]" />
                  <div className="h-3 w-1/2 animate-pulse rounded-md bg-[oklch(0.94_0.01_260)]" />
                </div>
              </div>
              <div className="mt-4 h-3 w-full animate-pulse rounded-md bg-[oklch(0.94_0.01_260)]" />
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  );
}
