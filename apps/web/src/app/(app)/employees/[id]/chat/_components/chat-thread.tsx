"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";

interface DraftMessage {
  role: "user" | "assistant";
  content: string;
  taskHref?: string;
}

interface ChatThreadProps {
  employeeId: string;
  employeeName: string;
  employeeRoleType: "marketing" | "sales" | "support";
}

const ROLE_COLORS: Record<string, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

const HISTORY_LIMIT = 200;
const MIN_TASK_CHARS = 8;

function deriveTaskHref(content: string): string | undefined {
  const m = content.match(/\/dashboard\/tasks\/([0-9a-f-]{36})/);
  if (m) return m[0];
  if (content.includes("/reviews")) return "/reviews";
  return undefined;
}

export function ChatThread({ employeeId, employeeName, employeeRoleType }: ChatThreadProps) {
  const [draftMessages, setDraftMessages] = useState<DraftMessage[]>([]);
  const [input, setInput] = useState("");
  const [showJumpPill, setShowJumpPill] = useState(false);
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

  const messages: DraftMessage[] = [
    ...(history.data ?? []).map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
      taskHref: row.role === "assistant" ? deriveTaskHref(row.content) : undefined,
    })),
    ...draftMessages,
  ];

  // Initial scroll: history.data flips from undefined to an array exactly
  // once. useLayoutEffect plus requestAnimationFrame waits for the messages
  // to lay out before snapping to bottom; without the RAF the scrollHeight
  // is still the empty-state height and the scroll lands mid-thread.
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

  // Subsequent scrolls: only auto-snap when the founder is already near the
  // bottom. Otherwise show a "Jump to latest" pill so a new message does
  // not yank them away from older context they were re-reading.
  useEffect(() => {
    if (!initialScrollDone.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight;
      setShowJumpPill(false);
    } else {
      setShowJumpPill(true);
    }
  }, [messages.length]);

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setShowJumpPill(false);
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
      // Best-effort persistence; the optimistic draft message keeps the UX moving.
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || createTask.isPending) return;

    setDraftMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    await persist("user", text);

    if (text.length < MIN_TASK_CHARS) {
      const ack = `I need a bit more to go on. Try: "Draft a tweet about our launch" or "Research three competitors in our space."`;
      setDraftMessages((prev) => [...prev, { role: "assistant", content: ack }]);
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
          taskHref: `/dashboard/tasks/${task.id}`,
        },
      ]);
      await persist("assistant", ack, task.id);
      refreshHistory();
      setDraftMessages([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      const errorContent = `I could not start that. ${msg}`;
      setDraftMessages((prev) => [...prev, { role: "assistant", content: errorContent }]);
      await persist("assistant", errorContent);
      refreshHistory();
      setDraftMessages([]);
    }
  }

  const roleHex = ROLE_COLORS[employeeRoleType] ?? "#9CA3AF";

  return (
    <GlassCard hoverable={false} className="relative flex flex-col h-[70vh] p-0 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (distance < 80 && showJumpPill) setShowJumpPill(false);
        }}
        className="flex-1 overflow-y-auto px-6 py-5 space-y-3"
      >
        {history.isLoading && (
          <p className="text-center text-xs text-text-muted py-12">Loading thread...</p>
        )}

        {!history.isLoading && messages.length === 0 && (
          <div className="text-center text-sm text-text-muted py-16 px-4">
            <p>No messages with {employeeName} yet.</p>
            <p className="mt-2 text-xs">
              Tell {employeeName} what to work on. Examples: &ldquo;Draft a tweet about our launch.&rdquo;
              &middot; &ldquo;Research three competitors.&rdquo;
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user" ? "bg-black text-white" : "bg-[oklch(0.97_0.005_260/0.6)] text-text"
              }`}
            >
              {msg.role === "assistant" && (
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider" style={{ color: roleHex }}>
                  {employeeName}
                </p>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.taskHref && (
                <Link
                  href={msg.taskHref}
                  className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
                >
                  Open task
                </Link>
              )}
            </div>
          </div>
        ))}

        {createTask.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-[oklch(0.97_0.005_260/0.6)] px-3.5 py-2.5">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {showJumpPill && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-[88px] left-1/2 -translate-x-1/2 rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white shadow-md hover:bg-gray-800"
          aria-label="Jump to latest message"
        >
          Jump to latest &darr;
        </button>
      )}

      <form onSubmit={handleSubmit} className="border-t border-[oklch(0.8_0.01_260/0.1)] px-6 py-4">
        <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
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
            placeholder={`Message ${employeeName}...`}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-text-muted"
            style={{ maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${target.scrollHeight}px`;
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || createTask.isPending}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-white disabled:opacity-30"
            aria-label="Send"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </form>
    </GlassCard>
  );
}
