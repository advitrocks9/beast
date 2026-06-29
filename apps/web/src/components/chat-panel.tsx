"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

interface Message {
  role: "user" | "assistant";
  content: string;
  taskHref?: string;
}

interface ChatPanelProps {
  employeeName: string;
  employeeId: string;
  open: boolean;
  onClose: () => void;
}

const MIN_TASK_CHARS = 8;
const HISTORY_LIMIT = 50;

function formatRunEvent(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "run_start":
      return "Started.";
    case "tool_call_start": {
      const name = typeof payload.toolName === "string" ? payload.toolName : "tool";
      return `Calling ${name.replace(/_/g, " ")}...`;
    }
    case "tool_call_end": {
      const name = typeof payload.toolName === "string" ? payload.toolName : "tool";
      return `Finished ${name.replace(/_/g, " ")}.`;
    }
    case "scratchpad_update":
      return "Updated plan.";
    case "error": {
      const msg = typeof payload.message === "string" ? payload.message : "ran into an error";
      return `Error: ${msg}`;
    }
    case "run_end": {
      const it = typeof payload.iterations === "number" ? payload.iterations : 0;
      return `Done in ${it} iteration${it === 1 ? "" : "s"}.`;
    }
    default:
      return type.replace(/_/g, " ");
  }
}

function deriveTaskHref(content: string): string | undefined {
  const m = content.match(/\/dashboard\/tasks\/([0-9a-f-]{36})/);
  if (m) return m[0];
  if (content.includes("/reviews")) return "/reviews";
  if (content.includes("/dashboard")) return "/dashboard";
  return undefined;
}

export function ChatPanel({ employeeName, employeeId, open, onClose }: ChatPanelProps) {
  const [draftMessages, setDraftMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createTask = useMutation(trpc.tasks.create.mutationOptions());
  const appendMessage = useMutation(trpc.chat.append.mutationOptions());

  const history = useQuery({
    ...trpc.chat.list.queryOptions({ employeeId, limit: HISTORY_LIMIT }),
    enabled: open,
  });

  const runEvents = useQuery({
    ...trpc.chat.runEvents.queryOptions({ taskId: activeTaskId ?? "" }),
    enabled: open && !!activeTaskId,
    refetchInterval: 2000,
  });

  // Stop polling once the run ends.
  useEffect(() => {
    if (!runEvents.data) return;
    const ended = runEvents.data.some((e) => e.eventType === "run_end" || e.eventType === "error");
    if (ended) {
      const t = setTimeout(() => setActiveTaskId(null), 4000);
      return () => clearTimeout(t);
    }
  }, [runEvents.data]);

  const messages: Message[] = [
    ...(history.data ?? []).map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
      taskHref: row.role === "assistant" ? deriveTaskHref(row.content) : undefined,
    })),
    ...draftMessages,
  ];

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

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
      if (!task.isMultiStep) setActiveTaskId(task.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      const errorContent = `I could not start that. ${msg}`;
      setDraftMessages((prev) => [...prev, { role: "assistant", content: errorContent }]);
      await persist("assistant", errorContent);
      refreshHistory();
      setDraftMessages([]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[380px] flex-col border-l border-[oklch(0.8_0.01_260/0.15)] bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-[oklch(0.8_0.01_260/0.1)] px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Chat with {employeeName}</p>
          <p className="text-xs text-text-muted">Tell me what you want done. I will pick it up immediately.</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-gray-100"
          aria-label="Close chat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-text-muted py-12 px-4">
            <p>Tell {employeeName} what to work on.</p>
            <p className="mt-2 text-xs">
              Examples: &ldquo;Draft a tweet about our launch.&rdquo;, &ldquo;Research three competitors&rdquo;, &ldquo;Write a cold email for SaaS founders.&rdquo;
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-text"
              }`}
            >
              <p>{msg.content}</p>
              {msg.taskHref && (
                <Link
                  href={msg.taskHref}
                  onClick={onClose}
                  className="mt-2 inline-block text-xs font-medium text-brand hover:underline"
                >
                  Open task
                </Link>
              )}
            </div>
          </div>
        ))}
        {createTask.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-gray-100 px-3.5 py-2.5">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {activeTaskId && runEvents.data && runEvents.data.length > 0 && (
          <div className="rounded-2xl border border-[oklch(0.85_0.01_260/0.4)] bg-[oklch(0.97_0.005_260/0.4)] px-3.5 py-2.5 text-xs">
            <p className="font-medium text-text-secondary mb-1.5">Activity</p>
            <ul className="space-y-1">
              {runEvents.data.slice(-6).map((e) => (
                <li key={e.id} className="text-text-muted">
                  {formatRunEvent(e.eventType, e.payload as Record<string, unknown>)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[oklch(0.8_0.01_260/0.1)] px-4 py-3">
        <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
            }}
            placeholder={`Message ${employeeName}...`}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-text-muted"
            style={{ maxHeight: "80px" }}
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
    </div>
  );
}
