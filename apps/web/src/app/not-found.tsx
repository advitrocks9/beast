import Link from "next/link";

export const metadata = {
  title: "Not found - Beast",
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="panel w-full max-w-md p-8 text-center">
        <p className="display-caps text-5xl text-identity">404</p>
        <h1 className="display mt-3 text-2xl">That page is not on the team.</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-ink-secondary">
          The route you tried does not exist. Hire someone real instead.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/" className="btn-ink">
            Home
          </Link>
          <Link href="/dashboard" className="btn-ghost">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
