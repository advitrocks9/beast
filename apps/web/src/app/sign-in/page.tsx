"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@beast/ui";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const message = searchParams.get("message");
  const urlError = searchParams.get("error");

  const isUnconfirmed =
    error?.toLowerCase().includes("email not confirmed") ||
    error?.toLowerCase().includes("not confirmed");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResent(false);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(humanizeAuthError(signInError.message));
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleResendConfirmation() {
    if (!email) {
      setError("Enter your email above first, then click Resend.");
      return;
    }
    setResending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/auto-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail ?? detail.error ?? "auto-confirm failed");
      }
      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm email.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[oklch(0.98_0.005_260)] px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">
            Beast
          </p>
          <h1 className="mt-2 font-(--font-display) text-3xl font-bold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Sign in to your AI employees.
          </p>
        </div>

        {message && (
          <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-center text-sm text-blue-800">
            {message}
          </div>
        )}

        {urlError && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-700">
            {urlError === "auth_callback_failed"
              ? "Authentication failed. Please try again."
              : urlError}
          </div>
        )}

        <GlassCard hoverable={false} className="p-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-text-secondary"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@yourcompany.com"
                className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-text-secondary"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black"
              />
            </div>

            {error && (
              <div className="space-y-2">
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
                {isUnconfirmed && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resending}
                    className="text-sm font-medium text-black underline disabled:opacity-50"
                  >
                    {resending ? "Confirming..." : "Confirm my email and try again"}
                  </button>
                )}
              </div>
            )}

            {resent && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                Email confirmed. Try signing in again.
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </GlassCard>

        <p className="mt-6 text-center text-sm text-text-secondary">
          No account yet?{" "}
          <Link href="/sign-up" className="font-medium text-black underline">
            Hire your first AI employee
          </Link>
        </p>
      </div>
    </main>
  );
}

function humanizeAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "That email and password do not match. Try again, or sign up if you do not have an account.";
  }
  if (lower.includes("email not confirmed") || lower.includes("not confirmed")) {
    return "Your email is not confirmed yet. Click the button below to confirm and try again.";
  }
  if (lower.includes("rate limit")) {
    return "Too many sign-in attempts. Wait a minute and try again.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }
  return raw;
}
