import Link from "next/link";
import { GlassCard } from "@beast/ui";

export const metadata = {
  title: "Not found - Beast",
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-warm p-6">
      <GlassCard hoverable={false} className="w-full max-w-md p-8 text-center">
        <p className="font-(--font-display) text-5xl font-bold tracking-tight text-[#B05A38]">
          404
        </p>
        <h1 className="mt-3 font-(--font-display) text-2xl font-bold tracking-tight">
          That page is not on the team.
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-text-secondary">
          The route you tried does not exist. Hire someone real instead.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-gray-50"
          >
            Dashboard
          </Link>
        </div>
      </GlassCard>
    </main>
  );
}
