"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/colors";
import { Monogram } from "@/components/monogram";

interface SidebarEmployee {
  id: string;
  name: string;
  roleType: "marketing" | "sales" | "support";
  status: string;
}

interface SidebarProps {
  employees?: SidebarEmployee[];
  reviewCount?: number;
  open?: boolean;
  onClose?: () => void;
}

const OPERATIONS = [
  { href: "/dashboard", label: "The Office", exact: true },
  { href: "/reviews", label: "Review", match: ["/reviews", "/review/"] },
  { href: "/dashboard/tasks", label: "Jobs" },
  { href: "/dashboard/recurring", label: "Recurring" },
];

const COMPANY = [
  { href: "/employees", label: "Roster", exact: true },
  { href: "/memory", label: "Memory" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/goals", label: "Goals" },
];

export function Sidebar({ employees = [], reviewCount = 0, open = false, onClose }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (item: { href: string; exact?: boolean; match?: string[] }) => {
    if (item.match) return item.match.some((m) => pathname === m || pathname.startsWith(m));
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  };

  let index = 0;

  return (
    <aside
      onClick={onClose}
      className={cn(
        "z-40 flex h-full w-[232px] flex-col border-r border-hairline bg-bg",
        "fixed inset-y-0 left-0 transition-transform duration-200 md:static md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="rule-b mx-4 flex flex-col pt-5 pb-3">
        <Link href="/dashboard" className="display-caps text-[22px] leading-none">
          Beast
        </Link>
        <span className="spec-label mt-1.5">Autonomous AI company</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <SectionLabel>Operations</SectionLabel>
        {OPERATIONS.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            n={String(++index).padStart(2, "0")}
            active={isActive(item)}
            badge={item.href === "/reviews" ? reviewCount : undefined}
          >
            {item.label}
          </NavItem>
        ))}

        <SectionLabel className="mt-5">Company</SectionLabel>
        {COMPANY.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            n={String(++index).padStart(2, "0")}
            active={isActive(item)}
          >
            {item.label}
          </NavItem>
        ))}

        <SectionLabel className="mt-5">Roster</SectionLabel>
        {employees.map((emp) => {
          const meta = statusMeta(emp.status);
          return (
            <NavItem
              key={emp.id}
              href={`/employees/${emp.id}`}
              active={pathname.startsWith(`/employees/${emp.id}`)}
              icon={<Monogram name={emp.name} roleType={emp.roleType} size="sm" />}
            >
              <span className="flex flex-1 items-center justify-between gap-2">
                {emp.name}
                <span
                  aria-label={meta.label}
                  title={meta.label}
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.dot }}
                />
              </span>
            </NavItem>
          );
        })}
        <NavItem href="/hire" active={pathname === "/hire"} n="+">
          Hire
        </NavItem>
      </nav>

      <div className="border-t border-hairline px-2 py-2">
        <NavItem
          href="/how-it-works"
          active={pathname === "/how-it-works"}
          icon={<CircleHelp size={16} strokeWidth={1.5} className="mx-0.5 w-5 shrink-0" />}
        >
          How it works
        </NavItem>
        <NavItem
          href="/settings"
          active={pathname.startsWith("/settings")}
          icon={<Settings size={16} strokeWidth={1.5} className="mx-0.5 w-5 shrink-0" />}
        >
          Settings
        </NavItem>
      </div>
    </aside>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("spec-label px-3 pb-1.5", className)}>{children}</p>;
}

function NavItem({
  href,
  n,
  icon,
  active,
  badge,
  children,
}: {
  href: string;
  n?: string;
  icon?: React.ReactNode;
  active: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-[2px] px-3 py-[7px] text-[13.5px] transition-colors duration-150",
        active
          ? "bg-panel font-semibold text-ink shadow-[inset_2px_0_0_0_var(--color-ink)]"
          : "text-ink-secondary hover:bg-panel hover:text-ink",
      )}
    >
      {icon ?? (
        <span
          aria-hidden
          className={cn("spec w-5 text-center", active ? "text-ink" : "text-ink-muted")}
        >
          {n}
        </span>
      )}
      <span className="flex-1">{children}</span>
      {badge !== undefined && badge > 0 && (
        <span className="spec bg-ink px-1.5 py-0.5 text-[10px] text-white">{badge}</span>
      )}
    </Link>
  );
}
