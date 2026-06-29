import Link from "next/link";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100/80 bg-[#FAFAFA]/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="font-(--font-display) text-lg font-bold tracking-tight"
        >
          Beast
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/pricing"
            className="rounded-lg px-3 py-1.5 text-text-secondary hover:bg-white/60 hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/sign-in"
            className="rounded-lg px-3 py-1.5 text-text-secondary hover:bg-white/60 hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="ml-1 rounded-lg bg-black px-3 py-1.5 text-white hover:bg-gray-800"
          >
            Hire your first employee
          </Link>
        </nav>
      </div>
    </header>
  );
}
