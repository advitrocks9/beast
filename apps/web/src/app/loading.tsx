export default function RootLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-warm">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#E87B35]" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#3B82F6] [animation-delay:120ms]" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#22C55E] [animation-delay:240ms]" />
      </div>
    </main>
  );
}
