"use client";

import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";

interface ConnectorInfo {
  id: string;
  platform: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

interface SlackConnectorProps {
  connector: ConnectorInfo | null;
}

export function SlackConnector({ connector }: SlackConnectorProps) {
  const trpc = useTRPC();

  const connectMutation = useMutation(
    trpc.connectors.initOAuth.mutationOptions({
      onSuccess: (data) => {
        window.location.href = data.redirectUrl;
      },
    }),
  );

  const disconnectMutation = useMutation(
    trpc.connectors.disconnect.mutationOptions({
      onSuccess: () => {
        window.location.reload();
      },
    }),
  );

  const isConnected = connector?.status === "connected";
  const teamName = (connector?.metadata as Record<string, unknown>)?.teamName as string | undefined;
  const channelName = (connector?.metadata as Record<string, unknown>)?.channelName as string | undefined;

  return (
    <GlassCard hoverable={false} className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4A154B]">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium">Slack</p>
            {isConnected ? (
              <p className="text-xs text-text-secondary">
                Connected to <span className="font-medium">{teamName}</span>
                {channelName && <> &middot; #{channelName}</>}
              </p>
            ) : (
              <p className="text-xs text-text-muted">
                Get task completions, review requests, and check-ins in Slack
              </p>
            )}
          </div>
        </div>

        <div>
          {isConnected ? (
            <button
              onClick={() => disconnectMutation.mutate({ connectorId: connector!.id })}
              disabled={disconnectMutation.isPending}
              className="rounded-full border border-red-200 px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
            </button>
          ) : (
            <button
              onClick={() => connectMutation.mutate({ platform: "slack" })}
              disabled={connectMutation.isPending}
              className="rounded-full bg-[#4A154B] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#3a1039] disabled:opacity-50"
            >
              {connectMutation.isPending ? "Connecting..." : "Connect Slack"}
            </button>
          )}
        </div>
      </div>

      {connectMutation.isError && (
        <p className="mt-2 text-xs text-red-600">
          {connectMutation.error.message}
        </p>
      )}
    </GlassCard>
  );
}
