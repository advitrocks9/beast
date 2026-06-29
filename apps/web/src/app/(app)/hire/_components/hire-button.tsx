"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

const FOCUS_PLACEHOLDER: Record<string, string> = {
  marketing: "e.g. We sell to B2B SaaS founders. Voice is direct, no fluff. Always include a real metric.",
  sales: "e.g. ICP is series A engineering teams. Lead with a problem they recognize, not a feature.",
  support: "e.g. Refund requests over $200 escalate to me. Voice is calm, never defensive.",
};

export function HireButton({
  roleType,
  hex,
}: {
  roleType: "marketing" | "sales" | "support";
  hex: string;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [focus, setFocus] = useState("");
  const [showFocus, setShowFocus] = useState(false);

  const hire = useMutation({
    ...trpc.employees.hire.mutationOptions(),
    onSuccess: (employee) => {
      router.push(`/employees/${employee.id}`);
      router.refresh();
    },
  });

  function handleHire() {
    hire.mutate({
      roleType,
      functionIds: [],
      initialFocus: focus.trim() ? focus.trim() : undefined,
    });
  }

  return (
    <div className="space-y-2">
      {showFocus && (
        <textarea
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          rows={3}
          placeholder={FOCUS_PLACEHOLDER[roleType] ?? ""}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none"
        />
      )}

      <button
        onClick={handleHire}
        disabled={hire.isPending}
        className="block w-full rounded-xl px-4 py-2 text-center text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: hex }}
      >
        {hire.isPending ? "Hiring..." : "Hire"}
      </button>

      {!showFocus && (
        <button
          onClick={() => setShowFocus(true)}
          className="block w-full text-center text-[11px] font-medium text-text-muted hover:text-text"
        >
          Add a starting brief (optional)
        </button>
      )}

      {hire.error && (
        <p className="text-xs text-error">{hire.error.message}</p>
      )}
    </div>
  );
}
