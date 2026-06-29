"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/chat-panel";

interface DeskActionsProps {
  employeeId: string;
  employeeName: string;
}

export function DeskActions({ employeeId, employeeName }: DeskActionsProps) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <a
          href={`/employees/${employeeId}/chat`}
          className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-50"
        >
          Full chat
        </a>
        <button
          onClick={() => setChatOpen(true)}
          className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-50"
        >
          Quick chat
        </button>
        <a
          href={`/employees/${employeeId}/new-task`}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + New Task
        </a>
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
