"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Menu } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { roleColor, statusMeta } from "@/lib/colors";

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24);
  return `${dy}d ago`;
}

export function TopNav({ onMenu, demoMode }: { onMenu?: () => void; demoMode?: boolean }) {
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const list = useQuery({
    ...trpc.notifications.list.queryOptions(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const markRead = useMutation(trpc.notifications.markRead.mutationOptions());
  const markAllRead = useMutation(trpc.notifications.markAllRead.mutationOptions());

  const items = list.data?.items ?? [];
  const unreadCount = list.data?.unreadCount ?? 0;

  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date());

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/sign-in";
  }

  function handleItemClick(
    sourceType: "review" | "checkin" | "autonomy" | "plan_approval",
    sourceId: string,
    href: string,
  ) {
    setShowNotifs(false);
    markRead.mutate(
      { sourceType, sourceId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: trpc.notifications.list.queryOptions().queryKey,
          });
        },
      },
    );
    router.push(href);
  }

  function handleMarkAllRead() {
    const unread = items.filter((i) => !i.isRead);
    if (unread.length === 0) return;
    markAllRead.mutate(
      { items: unread.map((i) => ({ sourceType: i.sourceType, sourceId: i.sourceId })) },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: trpc.notifications.list.queryOptions().queryKey,
          });
        },
      },
    );
  }

  return (
    <header className="sticky top-0 z-40 flex h-[52px] items-center gap-3 border-b border-hairline bg-bg/95 px-5 backdrop-blur-[6px]">
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="flex h-8 w-8 items-center justify-center rounded-[2px] text-ink-secondary transition-colors hover:bg-panel hover:text-ink md:hidden"
      >
        <Menu size={18} strokeWidth={1.5} />
      </button>

      <span className="spec-label hidden md:block">{today}</span>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs((s) => !s)}
            className="relative flex h-8 w-8 items-center justify-center rounded-[2px] text-ink-secondary transition-colors hover:bg-panel hover:text-ink"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          >
            <Bell size={16} strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className="spec absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center bg-identity px-0.5 text-[9px] text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="panel absolute right-0 top-full mt-2 flex max-h-[480px] w-96 flex-col overflow-hidden">
              <div className="rule-b flex items-center justify-between px-4 py-2.5">
                <p className="text-sm font-semibold">Notifications</p>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    disabled={markAllRead.isPending}
                    className="spec-label transition-colors hover:text-ink disabled:opacity-50"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="overflow-y-auto">
                {list.isLoading && (
                  <div className="space-y-2 p-4">
                    <div className="h-4 w-3/4 bg-panel" />
                    <div className="h-4 w-1/2 bg-panel" />
                  </div>
                )}

                {!list.isLoading && items.length === 0 && (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-ink-muted">Nothing waiting on you.</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Filed deliverables and check-ins land here.
                    </p>
                  </div>
                )}

                {items.map((item) => (
                  <Link
                    key={`${item.sourceType}:${item.sourceId}`}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      handleItemClick(item.sourceType, item.sourceId, item.href);
                    }}
                    className={cn(
                      "hairline-b flex items-start gap-3 px-4 py-3 last:border-b-0 hover:bg-panel",
                      item.isRead && "opacity-60",
                    )}
                  >
                    <span
                      className="mt-1.5 inline-block h-2 w-2 shrink-0"
                      style={{
                        backgroundColor: item.employeeRoleType
                          ? roleColor(item.employeeRoleType)
                          : statusMeta(item.sourceType).dot,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="truncate text-xs text-ink-secondary">
                        {item.body}
                        {item.employeeName ? ` · ${item.employeeName}` : ""}
                      </p>
                      <p className="spec mt-0.5 text-[10px] text-ink-muted">
                        {relativeTime(new Date(item.occurredAt))}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {!demoMode && (
          <button
            onClick={handleSignOut}
            className="flex h-8 w-8 items-center justify-center rounded-[2px] text-ink-secondary transition-colors hover:bg-panel hover:text-ink"
            aria-label="Sign out"
          >
            <LogOut size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </header>
  );
}
