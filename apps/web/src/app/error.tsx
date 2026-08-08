"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root error boundary]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="panel w-full max-w-md p-8 text-center">
        <p className="spec-label">Something broke</p>
        <h1 className="display mt-3 text-2xl">We hit an error loading this page.</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-ink-secondary">
          The page failed to render. Try again, or head back to the dashboard.
        </p>
        {error.digest && (
          <p className="spec mt-4 text-ink-muted">Reference: {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={reset} className="btn-ink">
            Try again
          </button>
          <Link href="/" className="btn-ghost">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
