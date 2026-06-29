import Link from "next/link";
import { GlassCard } from "@beast/ui";
import { formatActivityPhrase, pickActivityLink } from "@/lib/activity-format";

export interface ActivityItem {
  id: string;
  actionType: string;
  actionDetail: Record<string, unknown>;
  createdAt: string;
  employeeId: string | null;
  employeeName: string;
  employeeColor: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  scopeName?: string | null;
}

export function ActivityFeed({ items, scopeName = null }: ActivityFeedProps) {
  const emptyCopy = scopeName
    ? `No recent activity for ${scopeName}.`
    : "No activity yet. Assign a task to get started.";

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="heading-gradient text-lg font-semibold">Recent activity</h2>
        <Link
          href="/dashboard/tasks"
          className="text-xs font-medium text-text-secondary hover:text-foreground"
        >
          View all &rarr;
        </Link>
      </div>
      {items.length === 0 ? (
        <GlassCard hoverable={false} className="p-4">
          <p className="text-sm text-text-muted text-center py-6">
            {emptyCopy}
          </p>
        </GlassCard>
      ) : (
        <GlassCard hoverable={false} className="divide-y divide-[oklch(0.8_0.01_260/0.1)]">
          {items.map((item) => {
            const phrase = formatActivityPhrase(item.actionType, item.actionDetail);
            const linkHref = pickActivityLink(item.actionType, item.actionDetail);
            return (
              <ActivityRow
                key={item.id}
                phrase={phrase}
                employeeName={item.employeeName}
                employeeColor={item.employeeColor}
                createdAt={item.createdAt}
                href={linkHref}
              />
            );
          })}
        </GlassCard>
      )}
    </div>
  );
}

function ActivityRow({
  phrase,
  employeeName,
  employeeColor,
  createdAt,
  href,
}: {
  phrase: string;
  employeeName: string;
  employeeColor: string;
  createdAt: string;
  href: string | null;
}) {
  const body = (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: employeeColor }}
      />
      <p className="flex-1 text-sm">
        <span className="font-medium">{employeeName}</span>{" "}
        {phrase}
      </p>
      <span className="text-xs text-text-muted">
        {formatRelativeTime(createdAt)}
      </span>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-colors hover:bg-gray-50">
      {body}
    </Link>
  ) : (
    body
  );
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
