"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Monogram } from "@/components/monogram";

interface TaskCommentsProps {
  taskId: string;
  employeeName: string;
  employeeRoleType: "marketing" | "sales" | "support";
}

const MIN_COMMENT_CHARS = 2;
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function stamp(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TaskComments({ taskId, employeeName, employeeRoleType }: TaskCommentsProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const comments = useQuery(trpc.chat.listByTask.queryOptions({ taskId }));

  const post = useMutation({
    ...trpc.chat.commentOnTask.mutationOptions(),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({
        queryKey: trpc.chat.listByTask.queryOptions({ taskId }).queryKey,
      });
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    },
  });

  const rerun = useMutation({
    ...trpc.tasks.rerunFromComment.mutationOptions(),
    onSuccess: (data) => {
      router.push(`/dashboard/tasks/${data.taskId}`);
    },
  });

  const items = comments.data ?? [];
  const hasFounderComment = items.some((c) => c.role === "user");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (text.length < MIN_COMMENT_CHARS || post.isPending) return;
    post.mutate({ taskId, content: text });
  }

  useEffect(() => {
    if (post.error) {
      console.error("[task-comments] post failed", post.error);
    }
  }, [post.error]);

  return (
    <section aria-label="Comments" className="mt-5">
      <div className="rule-t flex items-baseline justify-between pt-2.5">
        <h2 className="text-[15px] font-semibold">Comments</h2>
        {items.length > 0 && <span className="spec text-ink-muted">{items.length}</span>}
      </div>

      {items.length > 0 && (
        <ul className="mt-1">
          {items.map((c) => (
            <li key={c.id} className="hairline-b flex gap-3 py-3 last:border-b-0">
              {c.role === "assistant" ? (
                <Monogram name={employeeName} roleType={employeeRoleType} size="sm" />
              ) : (
                <span
                  aria-hidden
                  className="inline-flex h-6 w-6 shrink-0 select-none items-center justify-center rounded-[2px] bg-ink font-mono text-[10px] uppercase text-white"
                >
                  Yo
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-semibold">
                    {c.role === "assistant" ? employeeName : "You"}
                  </span>
                  <span className="spec text-ink-muted">{stamp(c.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-secondary">
                  {c.content}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="mt-3">
        <div className="rounded-[2px] border border-hairline bg-bg p-3 transition-colors focus-within:border-ink">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={`Comment for ${employeeName}. Course-correct or add context; the next run reads it.`}
            rows={2}
            className="w-full resize-none bg-transparent text-[13.5px] outline-none placeholder:text-ink-muted"
            style={{ maxHeight: "200px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${target.scrollHeight}px`;
            }}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="spec-label">cmd+enter to send · kept on the ticket</p>
            <button
              type="submit"
              disabled={draft.trim().length < MIN_COMMENT_CHARS || post.isPending}
              className={`btn-ink disabled:opacity-40 ${FOCUS}`}
            >
              {post.isPending ? "Posting..." : "Post comment"}
            </button>
          </div>
        </div>
        {post.error && <p className="spec mt-2 text-state-failed">{post.error.message}</p>}
      </form>

      {hasFounderComment && (
        <div className="hairline-t mt-3 flex flex-wrap items-center justify-between gap-2 pt-2.5">
          <p className="spec-label">The next run reads your latest comment.</p>
          <button
            type="button"
            onClick={() => rerun.mutate({ taskId })}
            disabled={rerun.isPending}
            className={`btn-ghost disabled:opacity-50 ${FOCUS}`}
          >
            {rerun.isPending ? "Commissioning..." : "Re-run with this guidance"}
          </button>
        </div>
      )}
      {rerun.error && <p className="spec mt-2 text-state-failed">{rerun.error.message}</p>}
    </section>
  );
}
