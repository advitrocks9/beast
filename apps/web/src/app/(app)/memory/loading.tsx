export default function MemoryLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="rule-b pb-4">
        <div className="h-8 w-40 bg-panel" />
        <div className="mt-2 h-3.5 w-72 bg-panel" />
      </div>
      <div className="hairline-b mt-1 flex gap-6 py-2.5">
        <div className="h-4 w-20 bg-panel" />
        <div className="h-4 w-20 bg-panel" />
        <div className="h-4 w-20 bg-panel" />
      </div>
      <div className="mt-5 space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="hairline-b flex gap-4 pb-3.5 last:border-b-0">
            <div className="h-3.5 w-12 shrink-0 bg-panel" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/3 bg-panel" />
              <div className="h-3.5 w-full bg-panel" />
              <div className="h-3 w-1/2 bg-panel" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
