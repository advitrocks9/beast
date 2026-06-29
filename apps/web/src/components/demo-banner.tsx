import Link from "next/link";

const REPO_URL = "https://github.com/advitrocks9/beast";

export function DemoBanner() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 bg-black px-4 py-1.5 text-center text-xs text-white">
      <span className="font-medium">Live demo</span>
      <span className="text-white/50">·</span>
      <span className="text-white/80">
        seeded data, read-only demo
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
