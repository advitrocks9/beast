"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="rule-b flex items-baseline justify-between pb-3">
          <span className="display-caps text-xl">Beast</span>
          <span className="spec-label">Manager sign-in</span>
        </div>

        <h1 className="display mt-8 text-3xl">Back to the office.</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Sign in to review what your company shipped.
        </p>

        {message && (
          <p className="mt-5 border border-emp-alex/40 bg-emp-alex/5 px-3.5 py-2.5 text-sm text-ink">
            {message}
          </p>
        )}

        {urlError && (
          <p className="mt-5 border border-state-failed/40 bg-state-failed/5 px-3.5 py-2.5 text-sm text-state-failed">
            {urlError === "auth_callback_failed"
              ? "Authentication failed. Please try again."
              : urlError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <Field
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder="you@yourcompany.com"
          />
          <Field
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />

          {error && (
            <div className="space-y-2">
              <p className="border border-state-failed/40 bg-state-failed/5 px-3.5 py-2.5 text-sm text-state-failed">
                {error}
              </p>
              {isUnconfirmed && (
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resending}
                  className="text-sm font-semibold text-ink underline underline-offset-2 disabled:opacity-50"
                >
                  {resending ? "Confirming..." : "Confirm my email and try again"}
                </button>
              )}
            </div>
          )}

          {resent && (
            <p className="border border-state-accepted/40 bg-state-accepted/5 px-3.5 py-2.5 text-sm text-state-accepted">
              Email confirmed. Try signing in again.
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-ink w-full disabled:opacity-50">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="hairline-t mt-8 pt-4 text-sm text-ink-secondary">
          No company yet?{" "}
          <Link href="/sign-up" className="font-semibold text-ink underline underline-offset-2">
            Found one
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="spec-label block">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="mt-1.5 block w-full border border-hairline bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
    </div>
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
