"use client";

import Link from "next/link";
import { useEffect } from "react";
import { GlassCard } from "@beast/ui";

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
    <main className="flex min-h-screen items-center justify-center bg-bg-warm p-6">
      <GlassCard hoverable={false} className="w-full max-w-md p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Something broke
        </p>
        <h1 className="mt-3 font-(--font-display) text-2xl font-bold tracking-tight">
          We hit an error loading this page.
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-text-secondary">
          The page failed to render. Try again, or head back to the dashboard.
        </p>
        {error.digest && (
          <p className="mt-4 font-mono text-[11px] text-text-muted">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-gray-50"
          >
            Go home
          </Link>
        </div>
      </GlassCard>
    </main>
  );
}
