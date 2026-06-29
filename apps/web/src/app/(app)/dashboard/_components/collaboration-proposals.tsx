"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";

export interface ProposalItem {
  id: string;
  fromEmployeeName: string;
  fromEmployeeColor: string;
  toEmployeeName: string;
  toEmployeeColor: string;
  proposal: string;
  sourceDeliverableId: string | null;
  createdAt: string;
}

interface CollaborationProposalsProps {
  items: ProposalItem[];
}

export function CollaborationProposals({ items }: CollaborationProposalsProps) {
  const trpc = useTRPC();
  const respond = useMutation(trpc.collaboration.respond.mutationOptions());
  const [dismissed, setDismissed] = useState<Record<string, "approved" | "rejected">>({});

  const visible = items.filter((p) => !dismissed[p.id]);
  if (visible.length === 0 && Object.keys(dismissed).length === 0) return null;

  return (
    <section>
      <h2 className="heading-gradient text-lg font-semibold mb-3">Collaboration proposals</h2>

      {visible.length === 0 ? (
        <p className="px-1 text-[11px] text-text-muted">
          {Object.keys(dismissed).length} answered just now. Refresh to update the list.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => (
            <GlassCard key={p.id} hoverable={false} className="p-4">
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: p.fromEmployeeColor }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-text-secondary">
                    <span className="font-medium" style={{ color: p.fromEmployeeColor }}>
                      {p.fromEmployeeName}
                    </span>
                    {" wants "}
                    <span className="font-medium" style={{ color: p.toEmployeeColor }}>
                      {p.toEmployeeName}
                    </span>
                    {" to take this on."}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{p.proposal}</p>
                  {p.sourceDeliverableId && (
                    <Link
                      href={`/review/${p.sourceDeliverableId}`}
                      className="mt-1 inline-block text-[11px] text-accent hover:underline"
                    >
                      Source deliverable &rarr;
                    </Link>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setDismissed((prev) => ({ ...prev, [p.id]: "approved" }));
                        respond.mutate({ proposalId: p.id, approved: true });
                      }}
                      disabled={respond.isPending}
                      className="rounded-full border border-[#16A34A] bg-[#F0FDF4] px-3 py-1 text-xs font-medium text-[#166534] hover:opacity-90"
                    >
                      Approve and create task
                    </button>
                    <button
                      onClick={() => {
                        setDismissed((prev) => ({ ...prev, [p.id]: "rejected" }));
                        respond.mutate({ proposalId: p.id, approved: false });
                      }}
                      disabled={respond.isPending}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-text-secondary hover:bg-gray-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </section>
  );
}
