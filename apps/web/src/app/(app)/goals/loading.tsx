export default function GoalsLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="rule-b pb-4">
        <div className="h-8 w-32 bg-panel" />
        <div className="mt-2 h-3.5 w-56 bg-panel" />
      </div>
      <div className="mt-5 space-y-7">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rule-t pt-3">
            <div className="h-5 w-2/3 bg-panel" />
            <div className="mt-2 h-3.5 w-1/3 bg-panel" />
            <div className="mt-4 h-[2px] w-full bg-panel" />
          </div>
        ))}
      </div>
    </div>
  );
}
