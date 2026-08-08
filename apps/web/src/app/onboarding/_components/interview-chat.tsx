"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { SuggestionChips } from "./suggestion-chips";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CategoryProgress {
  name: string;
  filled: boolean;
}

interface InterviewChatProps {
  companyName: string;
  initialProgress: {
    contextScore: number;
    categories: CategoryProgress[];
    totalItems: number;
    nextUnfilledCategory?: string | null;
  };
  onProgressUpdate: (progress: {
    contextScore: number;
    categories: CategoryProgress[];
    totalItems: number;
  }) => void;
  onReadyToContinue: () => void;
  revisitTrigger?: { category: string; nonce: number } | null;
}

const CATEGORY_REVISIT_LABEL: Record<string, string> = {
  company_overview: "company overview",
  products: "our products and services",
  audience: "our target audience",
  brand_voice: "our brand voice",
  competitors: "our competitors",
  team: "our team",
  processes: "our internal processes",
  historical_outputs: "examples of past work",
};

// Chips become noise once the founder is engaged; matches the spec's
// state-machine threshold.
const CHIPS_HIDE_AT_SCORE = 60;

export function InterviewChat({
  companyName,
  initialProgress,
  onProgressUpdate,
  onReadyToContinue,
  revisitTrigger,
}: InterviewChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `This interview seeds the company file for ${companyName}. The more it holds, the better your employees work.\n\nStart simple: what does ${companyName} do?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [nextCategory, setNextCategory] = useState<string | null>(
    initialProgress.nextUnfilledCategory ?? "company_overview",
  );
  const [contextScore, setContextScore] = useState(initialProgress.contextScore);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const trpc = useTRPC();

  const sendMessage = useMutation(trpc.onboarding.sendMessage.mutationOptions());
  const skipCategory = useMutation(trpc.onboarding.skipCategory.mutationOptions());

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Sidebar amend taps push a synthetic user message; keyed off nonce so the
  // same category can be revisited repeatedly in one session.
  const lastRevisitNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!revisitTrigger) return;
    if (lastRevisitNonceRef.current === revisitTrigger.nonce) return;
    lastRevisitNonceRef.current = revisitTrigger.nonce;
    const label =
      CATEGORY_REVISIT_LABEL[revisitTrigger.category] ?? revisitTrigger.category;
    const text = `I want to update what we have on ${label}.`;
    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => {
      const next = [...prev, userMessage];
      void (async () => {
        setIsTyping(true);
        try {
          const result = await sendMessage.mutateAsync({ messages: next });
          const assistantMessage: Message = { role: "assistant", content: result.response };
          setMessages((p) => [...p, assistantMessage]);
          onProgressUpdate(result.progress);
          setContextScore(result.progress.contextScore);
          setNextCategory(result.progress.nextUnfilledCategory ?? null);
          if (result.progress.contextScore >= 40) onReadyToContinue();
        } catch {
          setMessages((p) => [
            ...p,
            { role: "assistant", content: "That did not go through. Say it again?" },
          ]);
        } finally {
          setIsTyping(false);
        }
      })();
      return next;
    });
  }, [revisitTrigger, sendMessage, onProgressUpdate, onReadyToContinue]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sendMessage.isPending) return;

    const userMessage: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsTyping(true);

    try {
      const result = await sendMessage.mutateAsync({
        messages: updatedMessages,
      });

      const assistantMessage: Message = {
        role: "assistant",
        content: result.response,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      onProgressUpdate(result.progress);
      setContextScore(result.progress.contextScore);
      setNextCategory(result.progress.nextUnfilledCategory ?? null);

      if (result.progress.contextScore >= 40) {
        onReadyToContinue();
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "That did not go through. Say it again?" },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleChipPick(body: string) {
    setInput(body);
    inputRef.current?.focus();
  }

  async function handleChipSkip(category: string) {
    try {
      await skipCategory.mutateAsync({ category });
    } catch {
      // Best-effort skip; silent failure does not block the UX.
    }
    setNextCategory((current) => (current === category ? null : current));
  }

  const lastMessage = messages[messages.length - 1];
  const showChips =
    !isTyping &&
    !sendMessage.isPending &&
    input.trim().length === 0 &&
    contextScore < CHIPS_HIDE_AT_SCORE &&
    lastMessage?.role === "assistant" &&
    nextCategory !== null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <p className="spec-label hairline-b pb-2">Interview record · transcribed live</p>
          <ol>
            {messages.map((msg, i) => {
              const isLast = i === messages.length - 1;
              return (
                <li key={i} className="hairline-b py-3 last:border-b-0">
                  <p className="spec-label">
                    {msg.role === "user" ? "Founder" : "Interviewer"}
                  </p>
                  <div className="mt-1 text-[13.5px] leading-relaxed text-ink">
                    {msg.content.split("\n").map((line, j) => (
                      <p key={j} className={j > 0 ? "mt-2" : ""}>
                        {line}
                      </p>
                    ))}
                  </div>
                  {isLast && msg.role === "assistant" && showChips && (
                    <SuggestionChips
                      category={nextCategory}
                      onPick={handleChipPick}
                      onSkip={handleChipSkip}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          {isTyping && (
            <div className="py-3" aria-label="Interviewer is writing" role="status">
              <p className="spec-label">Interviewer</p>
              <div className="mt-2 space-y-1.5" aria-hidden>
                <div className="h-3 w-2/3 bg-panel" />
                <div className="h-3 w-1/2 bg-panel" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hairline-t px-6 py-4">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          <label htmlFor="interview-answer" className="spec-label block">
            Your answer
          </label>
          <div className="mt-1.5 flex items-end gap-2.5">
            <textarea
              id="interview-answer"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What the company does, who buys it, how it talks…"
              rows={1}
              className="max-h-[120px] flex-1 resize-none border border-hairline bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${target.scrollHeight}px`;
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || sendMessage.isPending}
              className="btn-ink shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <p className="spec-label mt-2">Enter sends · Shift+Enter for a new line</p>
        </form>
      </div>
    </div>
  );
}
