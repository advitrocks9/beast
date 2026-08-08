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
}

function shortDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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

export function CitationCard({ citation, index }: CitationCardProps) {
  const Icon = TYPE_ICON[citation.type];
  const domain = deriveDomain(citation);
  const lastMod = shortDate(citation.lastModified);

  return (
    <article id={`cite-${index}`} className="hairline-t scroll-mt-24 py-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-2">
        <span className="spec shrink-0 text-ink-muted">[{index}]</span>
        <p className="min-w-0 flex-1 truncate text-[13px] leading-snug font-medium" title={citation.title}>
          {citation.title}
        </p>
      </div>

      {citation.snippet && (
        <p className="mt-1.5 border-l border-hairline pl-2.5 text-[12px] leading-snug text-ink-secondary">
          {citation.snippet}
        </p>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span
          className="spec-label inline-flex min-w-0 items-center gap-1.5 normal-case"
          title={domain ?? citation.toolName ?? ""}
        >
          <Icon size={12} strokeWidth={1.5} className="shrink-0" />
          <span className="truncate">{domain ?? citation.toolName ?? citation.type}</span>
          {lastMod && <span className="shrink-0 whitespace-nowrap">· {lastMod}</span>}
        </span>
        {citation.url && (
          <a
            href={citation.url}
            target="_blank"
            rel="noreferrer"
            className="spec shrink-0 font-semibold text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Open
          </a>
        )}
      </div>
    </article>
  );
}
