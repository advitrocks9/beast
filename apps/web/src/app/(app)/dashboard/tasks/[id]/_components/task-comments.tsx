"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { roleColor } from "@/lib/colors";

interface TaskCommentsProps {
  taskId: string;
  employeeName: string;
  employeeRoleType: "marketing" | "sales" | "support";
}

const MIN_COMMENT_CHARS = 2;

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
  const roleHex = roleColor(employeeRoleType);
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
    <section>
      <h2 className="text-sm font-semibold mb-2">
        Comments
        {items.length > 0 && (
          <span className="ml-2 text-xs font-normal text-text-muted">
            ({items.length})
          </span>
        )}
      </h2>

      {items.length > 0 && (
        <div className="space-y-2 mb-3">
          {items.map((c) => (
            <GlassCard key={c.id} hoverable={false} className="p-3">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{
                    backgroundColor: c.role === "assistant" ? roleHex : "#111827",
                  }}
                >
                  {c.role === "assistant" ? employeeName[0] : "Y"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium">
                      {c.role === "assistant" ? employeeName : "You"}
                    </p>
                    <span className="text-[10px] text-text-muted">
                      {new Date(c.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text leading-relaxed">
                    {c.content}
                  </p>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <GlassCard hoverable={false} className="p-3">
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
            placeholder={`Comment for ${employeeName}. Course-correct, add context, or note feedback. The next run reads it.`}
            rows={2}
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-text-muted"
            style={{ maxHeight: "200px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${target.scrollHeight}px`;
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[11px] text-text-muted">
              Cmd+Enter to send. Comments are kept on the task forever.
            </p>
            <button
              type="submit"
              disabled={draft.trim().length < MIN_COMMENT_CHARS || post.isPending}
              className="rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-30"
            >
              {post.isPending ? "Posting..." : "Post comment"}
            </button>
          </div>
        </GlassCard>
        {post.error && (
          <p className="mt-2 text-xs text-error">{post.error.message}</p>
        )}
      </form>

      {hasFounderComment && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <p className="text-[11px] text-text-muted">
            Run again with your latest comment as guidance.
          </p>
          <button
            type="button"
            onClick={() => rerun.mutate({ taskId })}
            disabled={rerun.isPending}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-text-secondary hover:text-text disabled:opacity-50"
          >
            {rerun.isPending ? "Spawning..." : "Re-run with this guidance"}
          </button>
        </div>
      )}
      {rerun.error && (
        <p className="mt-2 text-xs text-error">{rerun.error.message}</p>
      )}
    </section>
  );
}
