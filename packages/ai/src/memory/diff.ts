export interface DiffSpan {
  type: "kept" | "added" | "removed";
  text: string;
}

export interface WordDiff {
  spans: DiffSpan[];
  magnitude: number;
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

function mergeSpans(spans: DiffSpan[]): DiffSpan[] {
  const merged: DiffSpan[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && last.type === span.type) {
      last.text += ` ${span.text}`;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/**
 * Word-level LCS diff. `magnitude` is changed tokens over max tokens:
 * 0 for identical texts, 1 when nothing is shared.
 */
export function diffWords(original: string, edited: string): WordDiff {
  const a = tokenize(original);
  const b = tokenize(edited);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return { spans: [], magnitude: 0 };

  // all token/table indices below are in-bounds by loop construction
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);
  const n = midA.length;
  const m = midB.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      table[i * width + j] =
        midA[i - 1] === midB[j - 1]
          ? table[(i - 1) * width + (j - 1)]! + 1
          : Math.max(table[(i - 1) * width + j]!, table[i * width + (j - 1)]!);
    }
  }

  const middle: DiffSpan[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && midA[i - 1] === midB[j - 1]) {
      middle.push({ type: "kept", text: midA[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || table[i * width + (j - 1)]! >= table[(i - 1) * width + j]!)) {
      middle.push({ type: "added", text: midB[j - 1]! });
      j--;
    } else {
      middle.push({ type: "removed", text: midA[i - 1]! });
      i--;
    }
  }
  middle.reverse();

  const spans = mergeSpans([
    ...(prefix > 0 ? [{ type: "kept" as const, text: a.slice(0, prefix).join(" ") }] : []),
    ...middle,
    ...(suffix > 0 ? [{ type: "kept" as const, text: a.slice(a.length - suffix).join(" ") }] : []),
  ]);

  const lcsLen = prefix + suffix + table[n * width + m]!;
  return { spans, magnitude: (maxLen - lcsLen) / maxLen };
}
