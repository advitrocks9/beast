"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="panel w-full max-w-md p-8 text-center">
        <p className="spec-label">This screen failed to load</p>
        <h1 className="display mt-3 text-2xl">Your team is fine. The page is not.</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-ink-secondary">
          The data fetch threw an error. Retry, or jump back to your dashboard.
        </p>
        {error.digest && (
          <p className="spec mt-4 text-ink-muted">Reference: {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={reset} className="btn-ink">
            Retry
          </button>
          <Link href="/dashboard" className="btn-ghost">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
