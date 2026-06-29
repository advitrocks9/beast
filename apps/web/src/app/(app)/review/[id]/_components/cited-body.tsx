import { parseCitedBody, type Citation } from "@beast/shared";
import { CitationPill } from "./citation-pill";
import { CitationCard } from "./citation-card";

interface CitedBodyProps {
  body: string;
  citations: Citation[];
  hex: string;
}

const MAX_INLINE_CITATIONS = 24;

export function CitedBody({ body, citations, hex }: CitedBodyProps) {
  const parsed = parseCitedBody(body, citations);

  // Render the parsed segments as paragraphs split on \n. Markers can sit
  // mid-paragraph, so we walk the segment list and split text segments by
  // newlines, flushing a <p> at every \n boundary.
  const paragraphs: React.ReactNode[][] = [[]];
  let key = 0;
  for (const seg of parsed.segments) {
    if (seg.kind === "text") {
      const parts = seg.text.split("\n");
      parts.forEach((part, i) => {
        if (i > 0) paragraphs.push([]);
        if (part.length > 0) {
          paragraphs[paragraphs.length - 1]!.push(
            <span key={`t${key++}`}>{part}</span>,
          );
        }
      });
    } else {
      const m = seg.marker;
      if (m.kind === "ok") {
        paragraphs[paragraphs.length - 1]!.push(
          <CitationPill
            key={`p${key++}`}
            n={m.index}
            variant="ok"
            hex={hex}
            ariaLabel={`Source ${m.index}: ${m.citation.title}`}
          />,
        );
      } else {
        paragraphs[paragraphs.length - 1]!.push(
          <CitationPill
            key={`p${key++}`}
            n={null}
            variant="warning"
            hex={hex}
            ariaLabel={`Missing source for marker ${m.id}`}
          />,
        );
      }
    }
  }

  const renderedBody = (
    <div className="prose prose-sm max-w-none">
      {paragraphs.map((nodes, i) => (
        <p key={i} className={nodes.length === 0 ? "h-3" : undefined}>
          {nodes}
        </p>
      ))}
    </div>
  );

  if (parsed.resolved.length === 0 && parsed.unresolvedIds.length === 0) {
    // No citations to render - just the body, no rail.
    return renderedBody;
  }

  const cards = parsed.resolved.slice(0, MAX_INLINE_CITATIONS).map((c, i) => (
    <CitationCard key={c.id} citation={c} index={i + 1} hex={hex} />
  ));

  const overflow = parsed.resolved.length > MAX_INLINE_CITATIONS
    ? parsed.resolved.length - MAX_INLINE_CITATIONS
    : 0;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <div className="md:col-span-2">{renderedBody}</div>
      <aside aria-label="Sources" className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Sources ({parsed.resolved.length})
        </p>
        {cards}
        {overflow > 0 && (
          <p className="text-xs text-text-muted">
            And {overflow} more not shown.
          </p>
        )}
      </aside>
    </div>
  );
}

export function unresolvedCitationCount(body: string, citations: Citation[]): number {
  return parseCitedBody(body, citations).unresolvedIds.length;
}
