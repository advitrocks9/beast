export function Tally({ count, threshold }: { count: number; threshold: number }) {
  return (
    <span aria-hidden className="inline-flex items-end gap-[2px]">
      {Array.from({ length: threshold }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-2.5 w-[3px] ${i < count ? "tally-fill bg-identity" : "bg-hairline"}`}
        />
      ))}
    </span>
  );
}
