import { eq, isNull, or, type AnyColumn, type SQL } from "drizzle-orm";

interface OverlayRow {
  id: string;
  demoSessionId: string | null;
  supersedesDeliverableId?: string | null;
}

/**
 * Overlay a visitor's copy-on-write rows over the shared seed: keeps seed rows
 * (minus any this session superseded) plus the session's own rows, preserving
 * input order. Other sessions' rows are dropped.
 */
export function withDemoOverlay<T extends OverlayRow>(rows: T[], sessionId: string | null): T[] {
  if (!sessionId) return rows.filter((row) => row.demoSessionId === null);
  const superseded = new Set<string>();
  for (const row of rows) {
    if (row.demoSessionId === sessionId && row.supersedesDeliverableId) {
      superseded.add(row.supersedesDeliverableId);
    }
  }
  return rows.filter(
    (row) =>
      row.demoSessionId === sessionId ||
      (row.demoSessionId === null && !superseded.has(row.id)),
  );
}

export function demoWhere(sessionId: string | null) {
  return {
    seedOnly: (column: AnyColumn): SQL => isNull(column),
    seedOrMine: (column: AnyColumn): SQL => {
      if (sessionId === null) return isNull(column);
      // or() is undefined only when called with zero conditions
      return or(isNull(column), eq(column, sessionId))!;
    },
  };
}
