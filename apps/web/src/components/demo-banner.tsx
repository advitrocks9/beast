import Link from "next/link";

const REPO_URL = "https://github.com/advitrocks9/beast";

export function DemoBanner() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 bg-ink px-4 py-1.5 text-center">
      <span className="spec text-[10px] uppercase tracking-[0.08em] text-white">
        Live demo
      </span>
      <span className="text-xs text-white/75">
        a seeded AI company you can commission, review, and teach
      </span>
      <span className="text-white/40">·</span>
      <Link
        href="/how-it-works"
        className="text-xs font-medium text-white underline underline-offset-2 hover:text-white/85"
      >
        how it works
      </Link>
      <span className="text-white/40">·</span>
      <Link
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="text-xs font-medium text-white underline underline-offset-2 hover:text-white/85"
      >
        source
      </Link>
    </div>
  );
}
