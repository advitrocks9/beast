"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { DEMO_MODE } from "@/lib/demo";
import { Monogram } from "@/components/monogram";
import { RegisterMark } from "@/components/state-chip";
import { ProvenanceTag } from "@/components/provenance-tag";

interface MemoEntry {
  role: "user" | "assistant";
  content: string;
  at: Date;
  taskHref?: string;
}

interface ChatThreadProps {
  employeeId: string;
  employeeName: string;
  employeeRoleType: "marketing" | "sales" | "support";
}

const HISTORY_LIMIT = 200;
const MIN_TASK_CHARS = 8;

function deriveTaskHref(content: string): string | undefined {
  const m = content.match(/\/dashboard\/tasks\/([0-9a-f-]{36})/);
  if (m) return m[0];
  if (content.includes("/reviews")) return "/reviews";
  return undefined;
}

function memoTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function ChatThread({ employeeId, employeeName, employeeRoleType }: ChatThreadProps) {
  const [draftMessages, setDraftMessages] = useState<MemoEntry[]>([]);
  const [input, setInput] = useState("");
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialScrollDone = useRef(false);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createTask = useMutation(trpc.tasks.create.mutationOptions());
  const appendMessage = useMutation(trpc.chat.append.mutationOptions());

  const history = useQuery(
    trpc.chat.list.queryOptions({ employeeId, limit: HISTORY_LIMIT }),
  );

  const messages: MemoEntry[] = [
    ...(history.data ?? []).map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
      at: row.createdAt,
      taskHref: row.role === "assistant" ? deriveTaskHref(row.content) : undefined,
    })),
    ...draftMessages,
  ];

  // RAF waits for the loaded thread to lay out; without it scrollHeight is still the empty height.
  useLayoutEffect(() => {
    if (initialScrollDone.current) return;
    if (!history.data || history.data.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      initialScrollDone.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [history.data]);

  // Only auto-snap near the bottom so a new memo never yanks the founder off older context.
  useEffect(() => {
    if (!initialScrollDone.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [messages.length]);

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setShowJump(false);
  }

  function refreshHistory() {
    queryClient.invalidateQueries({
      queryKey: trpc.chat.list.queryOptions({ employeeId, limit: HISTORY_LIMIT }).queryKey,
    });
  }

  async function persist(role: "user" | "assistant", content: string, taskId?: string) {
    try {
      await appendMessage.mutateAsync({ employeeId, role, content, taskId });
    } catch {
      // best-effort; the optimistic draft entry keeps the thread moving
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || createTask.isPending) return;

    setDraftMessages((prev) => [...prev, { role: "user", content: text, at: new Date() }]);
    setInput("");
    await persist("user", text);

    if (text.length < MIN_TASK_CHARS) {
      const ack = `I need a bit more to go on. Try: "Draft a tweet about our launch" or "Research three competitors in our space."`;
      setDraftMessages((prev) => [...prev, { role: "assistant", content: ack, at: new Date() }]);
      await persist("assistant", ack);
      refreshHistory();
      setDraftMessages([]);
      return;
    }

    try {
      const task = await createTask.mutateAsync({
        aiEmployeeId: employeeId,
        title: text.length > 80 ? text.slice(0, 77) + "..." : text,
        taskType: "ad_hoc",
        brief: { objective: text, instructions: text },
      });

      const ack = task.isMultiStep
        ? `Got it. This looks multi-step, so I'm drafting a plan first. Approve it on /dashboard and I'll start. Open task: /dashboard/tasks/${task.id}`
        : `Got it. Working on this now. I'll ping you when the deliverable lands. Open task: /dashboard/tasks/${task.id}`;

      setDraftMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: ack,
          at: new Date(),
          taskHref: `/dashboard/tasks/${task.id}`,
        },
      ]);
      await persist("assistant", ack, task.id);
      refreshHistory();
      setDraftMessages([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      const errorContent = `I could not start that. ${msg}`;
      setDraftMessages((prev) => [
        ...prev,
        { role: "assistant", content: errorContent, at: new Date() },
      ]);
      await persist("assistant", errorContent);
      refreshHistory();
      setDraftMessages([]);
    }
  }

  return (
    <div className="panel relative flex h-[70vh] flex-col overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (distance < 80 && showJump) setShowJump(false);
        }}
        className="flex-1 overflow-y-auto px-5 py-4"
      >
        {history.isLoading && (
          <div className="space-y-2.5 py-2">
            <div className="h-3.5 w-2/3 bg-panel" />
            <div className="h-3.5 w-1/2 bg-panel" />
            <div className="h-3.5 w-3/5 bg-panel" />
          </div>
        )}

        {!history.isLoading && messages.length === 0 && (
          <div className="px-4 py-14 text-center">
            <p className="spec-label">Memo thread empty</p>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-snug text-ink-secondary">
              Write {employeeName} a memo. &ldquo;Draft a tweet about our launch&rdquo; becomes a
              job on the queue; the deliverable comes back through review.
            </p>
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="hairline-b flex justify-end py-3 first:pt-1 last:border-b-0">
              <div className="max-w-[80%] rounded-[2px] bg-panel-sunken px-3.5 py-2.5">
                <p className="spec-label text-right">You · {memoTime(msg.at)}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            </div>
          ) : (
            <div key={i} className="hairline-b flex items-start gap-3 py-3 first:pt-1 last:border-b-0">
              <Monogram name={employeeName} roleType={employeeRoleType} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="spec-label">
                  {employeeName} · {memoTime(msg.at)}
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
                {msg.taskHref && (
                  <Link
                    href={msg.taskHref}
                    className="mt-1.5 inline-block text-[13px] font-semibold text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    Open the job
                  </Link>
                )}
              </div>
            </div>
          ),
        )}

        {createTask.isPending && (
          <p className="flex items-center gap-2 py-3 text-identity-deep">
            <RegisterMark size={11} />
            <span className="spec-label text-identity-deep">{employeeName} is taking the brief</span>
          </p>
        )}
      </div>

      {showJump && (
        <button
          type="button"
          onClick={jumpToLatest}
          aria-label="Jump to latest memo"
          className="absolute bottom-[92px] left-1/2 -translate-x-1/2 rounded-[2px] bg-ink px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#2C2C29] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Jump to latest
        </button>
      )}

      <form onSubmit={handleSubmit} className="hairline-t px-5 py-3.5">
        {DEMO_MODE && (
          <p className="mb-2 flex items-center gap-2">
            <span className="spec-label">Chat is product-mode only</span>
            <ProvenanceTag kind="stub" />
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={DEMO_MODE}
            placeholder={DEMO_MODE ? "Cloning the repo unlocks chat" : `Memo to ${employeeName}...`}
            aria-label={`Memo to ${employeeName}`}
            rows={1}
            className="flex-1 resize-none rounded-[2px] border border-hairline bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:bg-panel disabled:text-ink-muted"
            style={{ maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${target.scrollHeight}px`;
            }}
          />
          <button
            type="submit"
            disabled={DEMO_MODE || !input.trim() || createTask.isPending}
            className="btn-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
