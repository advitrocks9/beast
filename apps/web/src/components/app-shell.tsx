"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { DemoBanner } from "./demo-banner";

interface SidebarEmployee {
  id: string;
  name: string;
  roleType: "marketing" | "sales" | "support";
  status: "idle" | "working" | "review" | "active";
}

interface AppShellProps {
  employees: SidebarEmployee[];
  reviewCount: number;
  demoMode: boolean;
  children: React.ReactNode;
}

export function AppShell({ employees, reviewCount, demoMode, children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-bg-warm">
      {demoMode && <DemoBanner />}
      <div className="relative flex flex-1 overflow-hidden">
        <Sidebar
          employees={employees}
          reviewCount={reviewCount}
          open={navOpen}
          onClose={() => setNavOpen(false)}
        />
        {navOpen && (
          <button
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopNav onMenu={() => setNavOpen(true)} />
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
