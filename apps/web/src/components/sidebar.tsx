"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Stamp,
  ListTodo,
  Repeat,
  Users,
  Target,
  Archive,
  BookOpen,
  Settings,
  Plus,
  CircleHelp,
} from "lucide-react";
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

export function Sidebar({ employees = [], reviewCount = 0, open = false, onClose }: SidebarProps) {
  const pathname = usePathname();

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
        <NavItem href="/dashboard" icon={<LayoutGrid size={16} strokeWidth={1.5} />} active={pathname === "/dashboard"}>
          The Office
        </NavItem>
        <NavItem
          href="/reviews"
          icon={<Stamp size={16} strokeWidth={1.5} />}
          active={pathname === "/reviews" || pathname.startsWith("/review/")}
          badge={reviewCount}
        >
          Review
        </NavItem>
        <NavItem
          href="/dashboard/tasks"
          icon={<ListTodo size={16} strokeWidth={1.5} />}
          active={pathname.startsWith("/dashboard/tasks")}
        >
          Jobs
        </NavItem>
        <NavItem
          href="/dashboard/recurring"
          icon={<Repeat size={16} strokeWidth={1.5} />}
          active={pathname.startsWith("/dashboard/recurring")}
        >
          Recurring
        </NavItem>

        <SectionLabel className="mt-5">Company</SectionLabel>
        <NavItem href="/employees" icon={<Users size={16} strokeWidth={1.5} />} active={pathname === "/employees"}>
          Roster
        </NavItem>
        <NavItem href="/memory" icon={<Archive size={16} strokeWidth={1.5} />} active={pathname.startsWith("/memory")}>
          Memory
        </NavItem>
        <NavItem href="/knowledge" icon={<BookOpen size={16} strokeWidth={1.5} />} active={pathname.startsWith("/knowledge")}>
          Knowledge
        </NavItem>
        <NavItem href="/goals" icon={<Target size={16} strokeWidth={1.5} />} active={pathname === "/goals"}>
          Goals
        </NavItem>

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
        <NavItem href="/hire" icon={<Plus size={16} strokeWidth={1.5} />} active={pathname === "/hire"}>
          Hire
        </NavItem>
      </nav>

      <div className="border-t border-hairline px-2 py-2">
        <NavItem
          href="/how-it-works"
          icon={<CircleHelp size={16} strokeWidth={1.5} />}
          active={pathname === "/how-it-works"}
        >
          How it works
        </NavItem>
        <NavItem href="/settings" icon={<Settings size={16} strokeWidth={1.5} />} active={pathname.startsWith("/settings")}>
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
  icon,
  active,
  badge,
  children,
}: {
  href: string;
  icon: React.ReactNode;
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
      {icon}
      <span className="flex-1">{children}</span>
      {badge !== undefined && badge > 0 && (
        <span className="spec bg-ink px-1.5 py-0.5 text-[10px] text-white">{badge}</span>
      )}
    </Link>
  );
}
