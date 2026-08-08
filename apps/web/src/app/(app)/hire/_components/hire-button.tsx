"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { DEMO_MODE } from "@/lib/demo";
import { ProvenanceTag } from "@/components/provenance-tag";

const FOCUS_PLACEHOLDER: Record<string, string> = {
  marketing: "e.g. We sell to B2B SaaS founders. Voice is direct, no fluff. Always include a real metric.",
  sales: "e.g. ICP is series A engineering teams. Lead with a problem they recognize, not a feature.",
  support: "e.g. Refund requests over $200 escalate to me. Voice is calm, never defensive.",
};

export function HireButton({
  roleType,
  name,
  hex,
}: {
  roleType: "marketing" | "sales" | "support";
  name: string;
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
      initialFocus: focus.trim() ? focus.trim() : undefined,
    });
  }

  return (
    <div className="space-y-2">
      {showFocus && (
        <div>
          <label htmlFor={`focus-${roleType}`} className="spec-label block">
            Starting brief
          </label>
          <textarea
            id={`focus-${roleType}`}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            rows={3}
            placeholder={FOCUS_PLACEHOLDER[roleType] ?? ""}
            className="mt-1.5 block w-full resize-none rounded-[2px] border border-hairline bg-bg px-3 py-2 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleHire}
        disabled={DEMO_MODE || hire.isPending}
        style={{ backgroundColor: hex }}
        className="w-full rounded-[2px] px-4 py-2.5 text-[13.5px] leading-none font-semibold text-white transition-[filter] duration-150 hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 disabled:hover:brightness-100"
      >
        {hire.isPending ? "Hiring..." : `Hire ${name}`}
      </button>

      {DEMO_MODE ? (
        <p className="flex items-center justify-center gap-2">
          <span className="spec-label">Hiring is product-mode only</span>
          <ProvenanceTag kind="stub" />
        </p>
      ) : (
        !showFocus && (
          <button
            type="button"
            onClick={() => setShowFocus(true)}
            className="spec-label block w-full text-center transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Add a starting brief
          </button>
        )
      )}

      {hire.error && (
        <p className="border border-state-failed/40 bg-state-failed/5 px-3 py-2 text-[12.5px] text-state-failed">
          {hire.error.message}
        </p>
      )}
    </div>
  );
}
