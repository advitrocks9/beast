"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/settings/profile", label: "Profile", n: "01" },
  { href: "/settings/team", label: "Team", n: "02" },
  { href: "/settings/billing", label: "Billing", n: "03" },
  { href: "/settings/connectors", label: "Connectors", n: "04" },
  { href: "/settings/danger", label: "Danger", n: "05" },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rule-b pb-4">
        <h1 className="display text-3xl">Settings</h1>
        <p className="spec mt-1.5 text-ink-muted">
          Company record · roster · billing · connectors · account
        </p>
      </header>

      <div className="mt-5 flex flex-col gap-6 md:flex-row md:gap-8">
        <nav
          aria-label="Settings sections"
          className="flex shrink-0 gap-1 overflow-x-auto md:w-44 md:flex-col md:gap-0"
        >
          {SECTIONS.map((s) => {
            const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-baseline gap-2 border-l-2 px-3 py-[7px] text-[13px] transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  active
                    ? "border-ink bg-panel font-semibold text-ink"
                    : "border-transparent text-ink-secondary hover:bg-panel hover:text-ink",
                )}
              >
                <span className={cn("spec", active ? "text-ink" : "text-ink-muted")}>{s.n}</span>
                {s.label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
