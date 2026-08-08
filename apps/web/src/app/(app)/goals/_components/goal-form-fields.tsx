"use client";

const INPUT_CLASS =
  "mt-1.5 block w-full border border-hairline bg-bg px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function GoalField({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="spec-label">
        {label}
        {optional && " · optional"}
      </span>
      {children}
    </label>
  );
}

export { INPUT_CLASS };
