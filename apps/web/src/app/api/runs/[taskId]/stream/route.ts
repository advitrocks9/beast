import { and, asc, eq } from "drizzle-orm";
import { db, tasks, companies, agentRunEvents } from "@beast/db";
import { subscribeToRun, isRunActiveInProcess } from "@beast/ai";
import type { AgentRunEvent, RunStreamEvent, RunStreamKind } from "@beast/shared";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const ACTIVE_STATUSES = new Set(["queued", "planning", "plan_review", "running"]);
const REPLAY_PACE_MS = 700;
const POLL_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// jsonb round-trips reorder keys, so dedupe on a key-sorted serialization.
function stableKey(event: AgentRunEvent): string {
  return JSON.stringify(event, Object.keys(event).sort());
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await ctx.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user.id),
    columns: { id: true },
  });
  if (!company) return new Response("Unauthorized", { status: 401 });

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.companyId, company.id)),
    columns: { id: true, status: true },
  });
  if (!task) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Every stream is labelled with its provenance; a stub-provider run
      // flips the whole stream to "simulated" from its run_start onward.
      let simulated = false;

      const send = (kind: RunStreamKind, event: AgentRunEvent) => {
        if (closed) return;
        if (event.type === "run_start" && event.provider === "stub") simulated = true;
        const frame: RunStreamEvent = { kind: simulated ? "simulated" : kind, event };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      };

      const finish = () => {
        if (closed) return;
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
        closed = true;
        unsubscribe?.();
        controller.close();
      };

      const loadEvents = () =>
        db.query.agentRunEvents.findMany({
          where: eq(agentRunEvents.taskId, taskId),
          orderBy: [asc(agentRunEvents.createdAt), asc(agentRunEvents.id)],
        });

      if (!ACTIVE_STATUSES.has(task.status)) {
        for (const row of await loadEvents()) {
          send("replay", row.payload as AgentRunEvent);
          await sleep(REPLAY_PACE_MS);
          if (closed) return;
        }
        finish();
        return;
      }

      if (isRunActiveInProcess(taskId)) {
        const buffered: AgentRunEvent[] = [];
        let caughtUp = false;
        unsubscribe = subscribeToRun(taskId, (event) => {
          if (caughtUp) send("live", event);
          else buffered.push(event);
        });

        const persisted = await loadEvents();
        const seen = new Set(persisted.map((row) => stableKey(row.payload as AgentRunEvent)));
        for (const row of persisted) send("live", row.payload as AgentRunEvent);
        for (const event of buffered) {
          if (!seen.has(stableKey(event))) send("live", event);
        }
        caughtUp = true;

        // The bus goes quiet the moment the run leaves this process.
        while (!closed && isRunActiveInProcess(taskId)) {
          await sleep(500);
        }
        await sleep(200);
        finish();
        return;
      }

      // Run executing elsewhere (Trigger.dev or another instance): the bus
      // cannot see it, so tail the persisted trajectory instead.
      let sent = 0;
      const initial = await loadEvents();
      for (const row of initial) send("live", row.payload as AgentRunEvent);
      sent = initial.length;

      while (!closed) {
        await sleep(POLL_MS);
        if (closed) return;
        const rows = await loadEvents();
        for (const row of rows.slice(sent)) send("live", row.payload as AgentRunEvent);
        sent = Math.max(sent, rows.length);

        const current = await db.query.tasks.findFirst({
          where: eq(tasks.id, taskId),
          columns: { status: true },
        });
        if (!current || !ACTIVE_STATUSES.has(current.status)) {
          finish();
          return;
        }
      }
    },
    cancel() {
      closed = true;
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
