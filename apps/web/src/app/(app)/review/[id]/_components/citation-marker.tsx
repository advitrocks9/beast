"use client";

interface CitationMarkProps {
  n: number | null;
  variant: "ok" | "warning";
  ariaLabel: string;
}

export function CitationMark({ n, variant, ariaLabel }: CitationMarkProps) {
  const isWarning = variant === "warning";
  const targetHash = isWarning ? undefined : `#cite-${n}`;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!targetHash) return;
    e.preventDefault();
    const el = document.querySelector<HTMLElement>(targetHash);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    if (!reduced) {
      el.animate(
        [{ backgroundColor: "var(--color-identity-tint)" }, { backgroundColor: "transparent" }],
        { duration: 250, easing: "ease-out" },
      );
    }
  }

  if (isWarning) {
    return (
      <sup
        aria-label={ariaLabel}
        title={ariaLabel}
        className="spec mx-px cursor-help font-semibold text-state-failed"
      >
        [!]
      </sup>
    );
  }

  return (
    <sup className="mx-px">
      <a
        href={targetHash}
        onClick={handleClick}
        aria-label={ariaLabel}
        className="spec font-semibold text-ink-secondary no-underline transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        [{n}]
      </a>
    </sup>
  );
}
