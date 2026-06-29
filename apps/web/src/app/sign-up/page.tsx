"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";

export default function SignUpPage() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const trpc = useTRPC();
  const ensureCompany = useMutation(trpc.company.ensure.mutationOptions());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { company_name: companyName } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Auto-confirm via the service-role-backed route, then sign in.
    // This bypasses the Supabase email-confirmation round trip so v0
    // founders go straight from sign-up to onboarding.
    try {
      const res = await fetch("/api/auth/auto-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail ?? detail.error ?? "auto-confirm failed");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Account created. Could not auto-confirm (${err.message}). Try signing in.`
          : "Account created. Try signing in.",
      );
      setLoading(false);
      return;
    }

    // If signUp returned a session (email-confirmation off at project),
    // we already have one. Otherwise, log in to mint a session now.
    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(`Account created but sign-in failed: ${signInError.message}`);
        setLoading(false);
        return;
      }
    }

    // Create the company record before entering onboarding
    try {
      await ensureCompany.mutateAsync({ name: companyName });
    } catch {
      setError("Account created but failed to set up company. Please refresh.");
      setLoading(false);
      return;
    }

    window.location.href = "/onboarding";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-warm px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">
            Beast
          </p>
          <h1 className="mt-2 font-(--font-display) text-3xl font-bold tracking-tight">
            Hire your first AI employee
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Free during private beta. No credit card.
          </p>
        </div>

        <GlassCard hoverable={false} className="p-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="companyName"
                className="block text-sm font-medium text-text-secondary"
              >
                Company name
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                autoComplete="organization"
                placeholder="Acme Marketing"
                className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-text-secondary"
              >
                Work email
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
                minLength={6}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Setting up your account..." : "Create account"}
            </button>
          </form>
        </GlassCard>

        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-black underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
