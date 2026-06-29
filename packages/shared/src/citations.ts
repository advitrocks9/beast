// Source attached to a deliverable claim. Renderer pulls one of these per
// `[^id]` marker found in the deliverable body.

export type CitationType = "web" | "kb" | "memory" | "tool";

export interface Citation {
  id: string;
  type: CitationType;
  title: string;
  url?: string;
  domain?: string;
  snippet: string;
  lastModified?: string;
  employeeId?: string;
  toolName?: string;
}

export interface ResolvedMarker {
  kind: "ok";
  citation: Citation;
  index: number;
}

export interface UnresolvedMarker {
  kind: "missing";
  id: string;
}

export type Marker = ResolvedMarker | UnresolvedMarker;

const MARKER_RE = /\[\^([A-Za-z0-9_-]+)\]/g;

export interface SegmentText {
  kind: "text";
  text: string;
}

export interface SegmentMarker {
  kind: "marker";
  marker: Marker;
}

export type Segment = SegmentText | SegmentMarker;

// Parse a body string into a flat list of text + marker segments. Resolves
// each `[^id]` marker against the citations array, attaching a 1-based
// index in source order. Markers with no matching citation render as
// missing markers; the caller surfaces them as warning pills.
export function parseCitedBody(body: string, citations: Citation[]): {
  segments: Segment[];
  resolved: Citation[];
  unresolvedIds: string[];
} {
  const byId = new Map(citations.map((c) => [c.id, c]));
  const indexById = new Map<string, number>();
  const resolved: Citation[] = [];
  const unresolvedIds: string[] = [];
  const segments: Segment[] = [];

  let lastIndex = 0;
  for (const match of body.matchAll(MARKER_RE)) {
    const id = match[1]!;
    const start = match.index!;
    if (start > lastIndex) {
      segments.push({ kind: "text", text: body.slice(lastIndex, start) });
    }
    const cite = byId.get(id);
    if (cite) {
      let idx = indexById.get(id);
      if (idx === undefined) {
        resolved.push(cite);
        idx = resolved.length;
        indexById.set(id, idx);
      }
      segments.push({
        kind: "marker",
        marker: { kind: "ok", citation: cite, index: idx },
      });
    } else {
      if (!unresolvedIds.includes(id)) unresolvedIds.push(id);
      segments.push({
        kind: "marker",
        marker: { kind: "missing", id },
      });
    }
    lastIndex = start + match[0].length;
  }

  if (lastIndex < body.length) {
    segments.push({ kind: "text", text: body.slice(lastIndex) });
  }

  return { segments, resolved, unresolvedIds };
}
