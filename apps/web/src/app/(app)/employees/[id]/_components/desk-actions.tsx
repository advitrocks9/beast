"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatPanel } from "@/components/chat-panel";

interface DeskActionsProps {
  employeeId: string;
  employeeName: string;
}

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function DeskActions({ employeeId, employeeName }: DeskActionsProps) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/employees/${employeeId}/chat`} className={`btn-ghost ${FOCUS_RING}`}>
          Open chat
        </Link>
        <button type="button" onClick={() => setChatOpen(true)} className={`btn-ghost ${FOCUS_RING}`}>
          Quick chat
        </button>
        <Link href={`/employees/${employeeId}/new-task`} className={`btn-identity ${FOCUS_RING}`}>
          Brief a job
        </Link>
      </div>

      <ChatPanel
        employeeId={employeeId}
        employeeName={employeeName}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </>
  );
}
