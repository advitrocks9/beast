"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/rules", label: "Rules" },
  { href: "/settings/connectors", label: "Connectors" },
  { href: "/settings/danger", label: "Danger" },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-(--font-display) text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your company profile, AI employees, and account.
        </p>
      </div>

      <div className="border-b border-[oklch(0.8_0.01_260/0.15)]">
        <nav className="flex gap-6">
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            const isDanger = tab.href === "/settings/danger";
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative -mb-px border-b-2 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? isDanger
                      ? "border-error text-error"
                      : "border-accent text-text"
                    : "border-transparent text-text-muted hover:text-text"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div>{children}</div>
    </div>
  );
}
