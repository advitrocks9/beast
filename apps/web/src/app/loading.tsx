export default function RootLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-warm">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#A85D44]" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#834A6A] [animation-delay:120ms]" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#15803D] [animation-delay:240ms]" />
      </div>
    </main>
  );
}
