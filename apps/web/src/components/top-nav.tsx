"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { createClient } from "@/lib/supabase/client";

const ROLE_COLORS: Record<string, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

const SOURCE_DOT: Record<string, string> = {
  review: "#7C3AED",
  checkin: "#22C55E",
  autonomy: "#E87B35",
  plan_approval: "#3B82F6",
};

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

export function TopNav() {
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

  function handleItemClick(sourceType: "review" | "checkin" | "autonomy" | "plan_approval", sourceId: string, href: string) {
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
    if (items.length === 0) return;
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
    <header className="flex h-14 items-center justify-end gap-3 border-b border-[oklch(0.8_0.01_260/0.1)] bg-[oklch(1_0_0/0.6)] backdrop-blur-[16px] backdrop-saturate-[1.2] px-6 sticky top-0 z-40">
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setShowNotifs((s) => !s)}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-[oklch(0.97_0.005_260/0.5)] hover:text-text"
          aria-label="Notifications"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error text-[10px] font-medium text-white px-1">
              {unreadCount}
            </span>
          )}
        </button>

        {showNotifs && (
          <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-[oklch(0.8_0.01_260/0.15)] bg-white shadow-lg max-h-[480px] flex flex-col">
            <div className="flex items-center justify-between border-b border-[oklch(0.8_0.01_260/0.1)] px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={markAllRead.isPending}
                  className="text-xs text-text-secondary hover:text-text disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="overflow-y-auto">
              {list.isLoading && (
                <div className="px-4 py-6 text-center text-sm text-text-muted">
                  Loading...
                </div>
              )}

              {!list.isLoading && items.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-text-muted">No notifications.</p>
                  <p className="text-xs text-text-muted mt-1">
                    Updates appear here when employees complete tasks or need your input.
                  </p>
                </div>
              )}

              {items.map((item) => {
                const dotColor = item.employeeRoleType
                  ? ROLE_COLORS[item.employeeRoleType] ?? SOURCE_DOT[item.sourceType] ?? "#9CA3AF"
                  : SOURCE_DOT[item.sourceType] ?? "#9CA3AF";
                const opacity = item.isRead ? "opacity-60" : "";
                return (
                  <Link
                    key={`${item.sourceType}:${item.sourceId}`}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      handleItemClick(item.sourceType, item.sourceId, item.href);
                    }}
                    className={`flex items-start gap-3 border-b border-[oklch(0.8_0.01_260/0.05)] px-4 py-3 hover:bg-[oklch(0.97_0.005_260/0.5)] last:border-b-0 ${opacity}`}
                  >
                    <span
                      className="mt-1.5 inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-text-secondary truncate">
                        {item.body}
                        {item.employeeName ? ` · ${item.employeeName}` : ""}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {relativeTime(new Date(item.occurredAt))}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSignOut}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-[oklch(0.97_0.005_260/0.5)] hover:text-text"
        aria-label="Sign out"
      >
        <LogOut size={18} />
      </button>
    </header>
  );
}
