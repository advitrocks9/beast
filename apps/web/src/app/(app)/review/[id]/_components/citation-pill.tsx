"use client";

interface CitationPillProps {
  n: number | null;
  variant: "ok" | "warning";
  ariaLabel: string;
  hex: string;
}

export function CitationPill({ n, variant, ariaLabel, hex }: CitationPillProps) {
  const isWarning = variant === "warning";
  const targetHash = isWarning ? undefined : `#cite-${n}`;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
    if (!targetHash) return;
    e.preventDefault();
    const el = document.querySelector(targetHash);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("cite-flash");
    void (el as HTMLElement).offsetHeight;
    el.classList.add("cite-flash");
  }

  const styles = isWarning
    ? {
        background: "var(--color-error)",
        color: "white",
      }
    : {
        background: `${hex}20`,
        color: hex,
      };

  if (isWarning) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold align-middle"
        style={styles}
      >
        !
      </button>
    );
  }

  return (
    <a
      href={targetHash}
      onClick={handleClick}
      aria-label={ariaLabel}
      className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold align-middle no-underline transition-transform hover:-translate-y-px"
      style={styles}
    >
      {n}
    </a>
  );
}
