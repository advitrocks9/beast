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

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <div className="flex gap-1">
        <span className="h-2 w-2 animate-bounce rounded-full bg-text-muted [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-text-muted [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-text-muted [animation-delay:300ms]" />
      </div>
    </div>
  );
}

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
      content: `Hey! I'm going to help you set up Beast for ${companyName}. The more I know about your company, the better your AI employees will perform.\n\nLet's start simple - what does ${companyName} do?`,
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
  const trackChip = useMutation(trpc.events.track.mutationOptions());

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fire onboarding_chip_shown once per category, when the chip group becomes
  // visible. The ref tracks the last category we already reported, so a stale
  // re-render does not double-count.
  const lastShownCategoryRef = useRef<string | null>(null);

  // Founder taps a filled category in the sidebar -> push a synthetic user
  // message asking to revisit it. Keyed off revisitTrigger.nonce so the same
  // category can be revisited multiple times in one session.
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
            { role: "assistant", content: "Sorry, I had trouble processing that. Could you try again?" },
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

      // If context score >= 40, show option to continue
      if (result.progress.contextScore >= 40) {
        onReadyToContinue();
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I had trouble processing that. Could you try again?",
        },
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

  function handleChipPick(body: string, label: string, index: number) {
    setInput(body);
    inputRef.current?.focus();
    trackChip.mutate({
      eventName: "onboarding_chip_tapped",
      properties: { category: nextCategory, label, index, contextScore },
    });
  }

  async function handleChipSkip(category: string, label: string, index: number) {
    try {
      await skipCategory.mutateAsync({ category });
    } catch {
      // Best-effort skip; silent failure does not block the UX.
    }
    trackChip.mutate({
      eventName: "onboarding_chip_skipped",
      properties: { category, label, index, contextScore },
    });
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

  useEffect(() => {
    if (!showChips || !nextCategory) return;
    if (lastShownCategoryRef.current === nextCategory) return;
    lastShownCategoryRef.current = nextCategory;
    trackChip.mutate({
      eventName: "onboarding_chip_shown",
      properties: { category: nextCategory, contextScore },
    });
  }, [showChips, nextCategory, contextScore, trackChip]);

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            return (
            <div
              key={i}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-black text-white"
                    : "bg-[oklch(0.97_0.005_260/0.6)] text-text"
                }`}
              >
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
            </div>
            );
          })}
          {isTyping && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-[oklch(0.97_0.005_260/0.6)]">
                <TypingIndicator />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[oklch(0.8_0.01_260/0.15)] px-6 py-4">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          <div className="flex items-end gap-3 rounded-2xl border border-[oklch(0.8_0.01_260/0.15)] bg-white px-4 py-3 shadow-[0_1px_2px_oklch(0.3_0.02_260/0.04)]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell me about your company..."
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
              disabled={!input.trim() || sendMessage.isPending}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-white transition-opacity disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-text-muted">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}
