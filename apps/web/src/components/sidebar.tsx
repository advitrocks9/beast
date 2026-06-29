"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Users, Settings, Plus, Bell, LayoutDashboard, Target, ListTodo, BookOpen, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { roleColor, statusMeta } from "@/lib/colors";

interface SidebarEmployee {
  id: string;
  name: string;
  roleType: "marketing" | "sales" | "support";
  status: "idle" | "working" | "review" | "active";
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
        "z-40 flex h-full w-[240px] flex-col bg-[oklch(1_0_0/0.6)] backdrop-blur-[16px] backdrop-saturate-[1.2] border-r border-[oklch(0.8_0.01_260/0.15)]",
        "fixed inset-y-0 left-0 transition-transform duration-200 md:static md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center px-4 border-b border-[oklch(0.8_0.01_260/0.1)]">
        <Link href="/dashboard" className="font-(--font-display) text-lg font-bold tracking-tight">
          Beast
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <NavItem href="/dashboard" icon={<LayoutDashboard size={18} />} active={pathname === "/dashboard"}>
          The Office
        </NavItem>

        {/* Review queue */}
        {reviewCount > 0 && (
          <NavItem href="/reviews" icon={<Bell size={18} />} active={pathname === "/reviews"} badge={reviewCount}>
            Review Queue
          </NavItem>
        )}

        <NavItem
          href="/dashboard/tasks"
          icon={<ListTodo size={18} />}
          active={pathname === "/dashboard/tasks" || pathname.startsWith("/dashboard/tasks/")}
        >
          Tasks
        </NavItem>

        <NavItem
          href="/dashboard/recurring"
          icon={<Repeat size={18} />}
          active={pathname.startsWith("/dashboard/recurring")}
        >
          Recurring
        </NavItem>

        <NavItem
          href="/employees"
          icon={<Users size={18} />}
          active={pathname === "/employees"}
        >
          Employees
        </NavItem>

        <NavItem
          href="/goals"
          icon={<Target size={18} />}
          active={pathname === "/goals"}
        >
          Goals
        </NavItem>

        <NavItem
          href="/knowledge"
          icon={<BookOpen size={18} />}
          active={pathname.startsWith("/knowledge")}
        >
          Knowledge
        </NavItem>

        {/* Employee list */}
        <div className="pt-3 pb-1 px-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Team
          </span>
        </div>

        {employees.map((emp) => (
          <NavItem
            key={emp.id}
            href={`/employees/${emp.id}`}
            active={pathname === `/employees/${emp.id}`}
            icon={
              <span className="relative flex h-5 w-5 items-center justify-center">
                <span className="h-5 w-5 rounded-full opacity-20" style={{ backgroundColor: roleColor(emp.roleType) }} />
                <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full ring-2 ring-white" style={{ backgroundColor: statusMeta(emp.status).dot }} />
              </span>
            }
          >
            {emp.name}
          </NavItem>
        ))}

        <NavItem href="/hire" icon={<Plus size={18} />} active={pathname === "/hire"}>
          Hire Employee
        </NavItem>
      </nav>

      {/* Bottom */}
      <div className="border-t border-[oklch(0.8_0.01_260/0.1)] px-2 py-2">
        <NavItem href="/settings" icon={<Settings size={18} />} active={pathname.startsWith("/settings")}>
          Settings
        </NavItem>
      </div>
    </aside>
  );
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
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-[oklch(0.97_0.005_260/0.6)] text-text font-medium"
          : "text-text-secondary hover:bg-[oklch(0.97_0.005_260/0.4)] hover:text-text",
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {badge !== undefined && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand text-[11px] font-medium text-white px-1.5">
          {badge}
        </span>
      )}
    </Link>
  );
}
