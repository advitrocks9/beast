"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { statusMeta } from "@/lib/colors";
import { ExternalServicesSection } from "./_components/external-services-section";

type Platform = "twitter" | "linkedin" | "wordpress" | "slack";

const ERROR_COPY: Record<string, string> = {
  invalid_state: "OAuth state did not match. Start the connect flow again from this page.",
  twitter_denied: "You declined the Twitter authorization prompt.",
  unsupported_platform: "That platform is not supported yet.",
};

const PLATFORM_META: Record<Platform, { label: string; description: string; color: string }> = {
  twitter: {
    label: "Twitter / X",
    description: "Auto-publish approved tweets and pull replies for triage.",
    color: "#1DA1F2",
  },
  linkedin: {
    label: "LinkedIn",
    description: "Publish approved company posts and personal updates.",
    color: "#0A66C2",
  },
  wordpress: {
    label: "WordPress",
    description: "Publish approved blog posts to a self-hosted WordPress site.",
    color: "#21759B",
  },
  slack: {
    label: "Slack",
    description: "Notify reviewers when a deliverable lands and route check-ins.",
    color: "#4A154B",
  },
};

// Connector lifecycle states ride the shared status palette; labels stay
// connector-specific while color comes from the central module.
const CONNECTOR_STATUS: Record<string, { statusKey: string; label: string }> = {
  connected: { statusKey: "approved", label: "Connected" },
  active: { statusKey: "approved", label: "Connected" },
  expired: { statusKey: "pending", label: "Token expired" },
  revoked: { statusKey: "idle", label: "Disconnected" },
  pending: { statusKey: "pending", label: "Pending" },
};

export default function SettingsConnectorsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectedParam = searchParams.get("connected");
  const errorParam = searchParams.get("error");
  const list = useQuery(trpc.connectors.list.queryOptions());
  const initOAuth = useMutation(trpc.connectors.initOAuth.mutationOptions());
  const disconnect = useMutation({
    ...trpc.connectors.disconnect.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.connectors.list.queryOptions().queryKey,
      });
    },
  });
  const [errorByPlatform, setErrorByPlatform] = useState<Record<Platform, string | null>>({
    twitter: null,
    linkedin: null,
    wordpress: null,
    slack: null,
  });
  const [callbackBanner, setCallbackBanner] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!connectedParam && !errorParam) return;
    if (connectedParam) {
      const meta = PLATFORM_META[connectedParam as Platform];
      setCallbackBanner({
        kind: "success",
        text: meta ? `${meta.label} is connected.` : `${connectedParam} is connected.`,
      });
      queryClient.invalidateQueries({
        queryKey: trpc.connectors.list.queryOptions().queryKey,
      });
    } else if (errorParam) {
      setCallbackBanner({
        kind: "error",
        text: ERROR_COPY[errorParam] ?? decodeURIComponent(errorParam),
      });
    }
    router.replace("/settings/connectors");
  }, [connectedParam, errorParam, router, queryClient, trpc.connectors.list]);

  const rows = list.data ?? [];
  const byPlatform = new Map(rows.map((r) => [r.platform, r]));
  const bannerMeta = callbackBanner
    ? statusMeta(callbackBanner.kind === "success" ? "completed" : "error")
    : null;

  function handleConnect(platform: Platform) {
    setErrorByPlatform((prev) => ({ ...prev, [platform]: null }));
    initOAuth.mutate(
      { platform },
      {
        onSuccess: ({ redirectUrl }) => {
          window.location.href = redirectUrl;
        },
        onError: (err) => {
          const message = err.message?.includes("not configured")
            ? "Founder action: set the relevant API credentials in environment, then reload."
            : err.message ?? "Could not start OAuth.";
          setErrorByPlatform((prev) => ({ ...prev, [platform]: message }));
        },
      },
    );
  }

  function handleDisconnect(connectorId: string, label: string) {
    if (
      confirm(
        `Disconnect ${label}? Auto-publish jobs queued against this connector will fail until you reconnect.`,
      )
    ) {
      disconnect.mutate({ connectorId });
    }
  }

  return (
    <div className="space-y-3">
      {callbackBanner && bannerMeta && (
        <div
          className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs"
          style={{
            borderColor: bannerMeta.dot,
            backgroundColor: bannerMeta.bg,
            color: bannerMeta.fg,
          }}
          role={callbackBanner.kind === "error" ? "alert" : "status"}
        >
          <span>{callbackBanner.text}</span>
          <button
            onClick={() => setCallbackBanner(null)}
            className="font-medium underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
      <ExternalServicesSection />
      <div className="pt-3">
        <h2 className="text-sm font-semibold">OAuth connectors</h2>
        <p className="mt-1 text-xs text-text-muted">
          OAuth flows redirect you to the provider and back. Disconnect any
          time; auto-publish features that depend on the connector will fail
          until you reconnect.
        </p>
      </div>
      {(Object.keys(PLATFORM_META) as Platform[]).map((platform) => {
        const meta = PLATFORM_META[platform];
        const row = byPlatform.get(platform);
        const status = row?.status ?? null;
        const conn = status ? (CONNECTOR_STATUS[status] ?? CONNECTOR_STATUS.pending) : null;
        const sm = conn ? statusMeta(conn.statusKey) : null;
        const lastError = errorByPlatform[platform];

        return (
          <GlassCard key={platform} hoverable={false} className="p-5">
            <div className="flex items-start gap-4">
              <span
                className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: meta.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{meta.label}</p>
                  {conn && sm && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: sm.bg, color: sm.fg }}
                    >
                      {conn.label}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-text-secondary">{meta.description}</p>
                {lastError && (
                  <p className="mt-2 text-xs text-error">{lastError}</p>
                )}
              </div>
              <div className="shrink-0">
                {row && row.status !== "revoked" ? (
                  <button
                    onClick={() => handleDisconnect(row.id, meta.label)}
                    disabled={disconnect.isPending}
                    className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-gray-50 disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(platform)}
                    disabled={initOAuth.isPending}
                    className="rounded-full bg-black px-3.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {initOAuth.isPending ? "Starting..." : "Connect"}
                  </button>
                )}
              </div>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
