import { parseCitedBody, CITATION_MARKER_RE, type Citation } from "@beast/shared";
import { MarkdownBody } from "@/components/markdown-body";
import { CitationMark } from "./citation-marker";
import { CitationCard } from "./citation-card";

interface CitedBodyProps {
  body: string;
  citations: Citation[];
}

const MAX_INLINE_CITATIONS = 24;
const CITE_HREF = "#beast-cite-";

export function CitedBody({ body, citations }: CitedBodyProps) {
  const parsed = parseCitedBody(body, citations);
  const citationById = new Map(citations.map((c) => [c.id, c]));
  const indexById = new Map(parsed.resolved.map((c, i) => [c.id, i + 1]));

  // Citation markers become empty links so markdown carries them through
  // tables and lists; the `a` override swaps them back into superscripts.
  const source = body.replace(
    CITATION_MARKER_RE,
    (_m, id: string) => `[](${CITE_HREF}${id})`,
  );

  const renderedBody = (
    <div className="max-w-none">
      <MarkdownBody
        source={source}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith(CITE_HREF)) {
              const id = href.slice(CITE_HREF.length);
              const n = indexById.get(id);
              const cite = citationById.get(id);
              if (n !== undefined && cite) {
                return (
                  <CitationMark
                    n={n}
                    variant="ok"
                    ariaLabel={`Source ${n}: ${cite.title}`}
                  />
                );
              }
              return (
                <CitationMark
                  n={null}
                  variant="warning"
                  ariaLabel={`Missing source for marker ${id}`}
                />
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      />
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
