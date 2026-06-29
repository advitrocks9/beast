import Link from "next/link";

const REPO_URL = "https://github.com/advitrocks9/beast";

/**
 * Thin strip shown across the app when NEXT_PUBLIC_DEMO_MODE is on. Tells the
 * visitor the data is seeded and live agent actions are off, and points at the
 * source.
 */
export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-black px-4 py-1.5 text-center text-xs text-white">
      <span className="font-medium">Live demo</span>
      <span className="text-white/50">·</span>
      <span className="text-white/80">
        seeded data, agent runs and publishing are disabled
      </span>
      <span className="text-white/50">·</span>
      <Link
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="font-medium underline underline-offset-2 hover:text-white/90"
      >
        source on GitHub
      </Link>
    </div>
  );
}
