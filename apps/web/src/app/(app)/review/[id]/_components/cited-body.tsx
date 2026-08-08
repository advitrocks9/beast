import { parseCitedBody, type Citation } from "@beast/shared";
import { CitationMark } from "./citation-marker";
import { CitationCard } from "./citation-card";

interface CitedBodyProps {
  body: string;
  citations: Citation[];
}

const MAX_INLINE_CITATIONS = 24;

export function CitedBody({ body, citations }: CitedBodyProps) {
  const parsed = parseCitedBody(body, citations);

  // Markers can sit mid-paragraph, so walk the segment list and split text
  // segments on \n, flushing a <p> at every boundary.
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
          <CitationMark
            key={`m${key++}`}
            n={m.index}
            variant="ok"
            ariaLabel={`Source ${m.index}: ${m.citation.title}`}
          />,
        );
      } else {
        paragraphs[paragraphs.length - 1]!.push(
          <CitationMark
            key={`m${key++}`}
            n={null}
            variant="warning"
            ariaLabel={`Missing source for marker ${m.id}`}
          />,
        );
      }
    }
  }

  const renderedBody = (
    <div className="max-w-none text-[14px] leading-relaxed text-ink">
      {paragraphs.map((nodes, i) => (
        <p key={i} className={nodes.length === 0 ? "h-3" : "mb-3 last:mb-0"}>
          {nodes}
        </p>
      ))}
    </div>
  );

  if (parsed.resolved.length === 0 && parsed.unresolvedIds.length === 0) {
    return renderedBody;
  }

  const cards = parsed.resolved.slice(0, MAX_INLINE_CITATIONS).map((c, i) => (
    <CitationCard key={c.id} citation={c} index={i + 1} />
  ));

  const overflow = parsed.resolved.length > MAX_INLINE_CITATIONS
    ? parsed.resolved.length - MAX_INLINE_CITATIONS
    : 0;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <div className="md:col-span-2">{renderedBody}</div>
      <aside aria-label="Sources">
        <p className="spec-label rule-b pb-1.5">Sources · {parsed.resolved.length}</p>
        <div className="mt-2">{cards}</div>
        {overflow > 0 && (
          <p className="spec mt-2 text-ink-muted">and {overflow} more not shown</p>
        )}
      </aside>
    </div>
  );
}

export function unresolvedCitationCount(body: string, citations: Citation[]): number {
  return parseCitedBody(body, citations).unresolvedIds.length;
}
