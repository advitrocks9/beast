"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useTRPC } from "@/trpc/client";

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
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="rule-b flex items-baseline justify-between pb-3">
          <span className="display-caps text-xl">Beast</span>
          <span className="spec-label">Founding papers</span>
        </div>

        <h1 className="display mt-8 text-3xl">Found your company.</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Name it, answer the founding interview, and put your first employees to work.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <Field
            id="companyName"
            label="Company name"
            type="text"
            value={companyName}
            onChange={setCompanyName}
            autoComplete="organization"
            placeholder="Acme Marketing"
          />
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
            autoComplete="new-password"
            placeholder="At least 6 characters"
            minLength={6}
          />

          {error && (
            <p className="border border-state-failed/40 bg-state-failed/5 px-3.5 py-2.5 text-sm text-state-failed">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-ink w-full disabled:opacity-50">
            {loading ? "Founding..." : "Found the company"}
          </button>
        </form>

        <p className="hairline-t mt-8 pt-4 text-sm text-ink-secondary">
          Already founded?{" "}
          <Link href="/sign-in" className="font-semibold text-ink underline underline-offset-2">
            Sign in
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
  minLength,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  minLength?: number;
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
        minLength={minLength}
        className="mt-1.5 block w-full border border-hairline bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
    </div>
  );
}
