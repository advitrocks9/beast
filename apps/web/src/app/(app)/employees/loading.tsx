export default function EmployeesLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="rule-b pb-4">
        <div className="h-8 w-36 bg-panel" />
        <div className="mt-2 h-3.5 w-72 bg-panel" />
      </header>
      <div className="mt-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="hairline-b flex items-center gap-4 px-1 py-4 last:border-b-0">
            <div className="h-14 w-14 shrink-0 bg-panel" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-40 bg-panel" />
              <div className="h-3.5 w-56 bg-panel" />
              <div className="h-3 w-64 bg-panel" />
            </div>
            <div className="h-5 w-16 shrink-0 bg-panel" />
          </div>
        ))}
      </div>
    </div>
  );
}
