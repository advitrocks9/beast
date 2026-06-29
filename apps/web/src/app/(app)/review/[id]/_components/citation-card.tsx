import { Globe, FileText, BookMarked, Wrench } from "lucide-react";
import type { Citation } from "@beast/shared";

const TYPE_ICON = {
  web: Globe,
  kb: FileText,
  memory: BookMarked,
  tool: Wrench,
} as const;

interface CitationCardProps {
  citation: Citation;
  index: number;
  hex: string;
}

function shortDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function deriveDomain(citation: Citation): string | null {
  if (citation.domain) return citation.domain;
  if (!citation.url) return null;
  try {
    return new URL(citation.url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function CitationCard({ citation, index, hex }: CitationCardProps) {
  const Icon = TYPE_ICON[citation.type];
  const domain = deriveDomain(citation);
  const lastMod = shortDate(citation.lastModified);

  return (
    <article
      id={`cite-${index}`}
      className="rounded-xl border border-[oklch(0.9_0.005_260)] bg-white p-4 scroll-mt-24"
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-md"
          style={{ backgroundColor: `${hex}20`, color: hex }}
        >
          <Icon size={13} strokeWidth={2} />
        </span>
        <span
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold"
          style={{ backgroundColor: `${hex}20`, color: hex }}
        >
          {index}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={citation.title}>
          {citation.title}
        </p>
      </div>

      {lastMod && (
        <p className="mt-1 text-[11px] text-text-muted">Updated {lastMod}</p>
      )}

      {citation.snippet && (
        <p
          className="mt-3 border-l-2 pl-3 text-xs italic leading-relaxed text-text-secondary"
          style={{ borderColor: hex }}
        >
          {citation.snippet}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="truncate text-text-muted" title={domain ?? citation.toolName ?? ""}>
          {domain ?? citation.toolName ?? citation.type}
        </span>
        {citation.url && (
          <a
            href={citation.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Open
          </a>
        )}
      </div>
    </article>
  );
}
