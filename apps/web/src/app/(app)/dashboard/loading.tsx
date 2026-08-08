export default function DashboardLoading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-6xl">
      <header className="rule-b flex items-end justify-between gap-3 pb-4">
        <div>
          <div className="h-8 w-56 bg-panel" />
          <div className="mt-2.5 h-3 w-72 bg-panel" />
        </div>
        <div className="hidden h-9 w-40 bg-panel sm:block" />
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-5">
          <div className="panel p-4">
            <div className="h-4 w-48 bg-panel" />
            <div className="mt-4 space-y-2.5">
              <div className="h-3.5 w-2/3 bg-panel" />
              <div className="h-3.5 w-1/2 bg-panel" />
              <div className="h-3.5 w-3/5 bg-panel" />
              <div className="h-3.5 w-2/5 bg-panel" />
            </div>
          </div>

          <div className="rule-t pt-2.5">
            <div className="h-4 w-24 bg-panel" />
            <ul className="mt-2">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="hairline-b flex items-center gap-3 py-2.5 last:border-b-0">
                  <div className="h-6 w-6 shrink-0 bg-panel" />
                  <div className="h-3.5 flex-1 bg-panel" />
                  <div className="h-4 w-16 shrink-0 bg-panel" />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="panel-tinted p-4">
            <div className="h-4 w-28 bg-panel-sunken" />
            <div className="mt-3 space-y-2.5">
              <div className="h-3.5 w-full bg-panel-sunken" />
              <div className="h-3.5 w-3/4 bg-panel-sunken" />
              <div className="h-3.5 w-4/5 bg-panel-sunken" />
            </div>
            <div className="mt-4 h-9 w-full bg-panel-sunken" />
          </div>

          <div className="panel p-4">
            <div className="h-4 w-36 bg-panel" />
            <div className="mt-3 space-y-2.5">
              <div className="h-3.5 w-full bg-panel" />
              <div className="h-3.5 w-2/3 bg-panel" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
