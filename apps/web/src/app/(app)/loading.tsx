export default function AppLoading() {
  return (
    <div aria-busy="true" className="space-y-8">
      <div>
        <div className="h-8 w-48 bg-panel" />
        <div className="mt-2 h-4 w-72 bg-panel" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="panel p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 shrink-0 bg-panel" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-panel" />
                <div className="h-3 w-1/2 bg-panel" />
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <div className="h-3 w-full bg-panel" />
              <div className="h-3 w-5/6 bg-panel" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
