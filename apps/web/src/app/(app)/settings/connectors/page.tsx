"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { DEMO_MODE } from "@/lib/demo";
import { ProvenanceTag } from "@/components/provenance-tag";
import { ExternalServicesSection } from "./_components/external-services-section";

type Platform = "linkedin" | "twitter" | "wordpress" | "slack";

const ERROR_COPY: Record<string, string> = {
  invalid_state: "OAuth state did not match. Start the connect flow again from this page.",
  twitter_denied: "You declined the X authorization prompt.",
  unsupported_platform: "That platform is not supported yet.",
};

const PLATFORM_META: Record<Platform, { label: string; description: string }> = {
  linkedin: {
    label: "LinkedIn",
    description: "Publishes approved company posts and personal updates.",
  },
  twitter: {
    label: "X",
    description: "Publishes approved posts and pulls replies for triage.",
  },
  wordpress: {
    label: "WordPress",
    description: "Publishes approved blog posts to a self-hosted site.",
  },
  slack: {
    label: "Slack",
    description: "Notifies reviewers when a deliverable lands and routes check-ins.",
  },
};

const STATE_COPY: Record<string, { label: string; tone: string }> = {
  connected: { label: "connected", tone: "text-state-accepted" },
  active: { label: "connected", tone: "text-state-accepted" },
  expired: { label: "token expired", tone: "text-identity-deep" },
  pending: { label: "pending", tone: "text-ink-muted" },
  revoked: { label: "disconnected", tone: "text-ink-muted" },
};

const DISCONNECTED = { label: "disconnected", tone: "text-ink-muted" };

export default function SettingsConnectorsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectedParam = searchParams.get("connected");
  const errorParam = searchParams.get("error");
  const list = useQuery({
    ...trpc.connectors.list.queryOptions(),
    enabled: !DEMO_MODE,
  });
  const initOAuth = useMutation(trpc.connectors.initOAuth.mutationOptions());
  const disconnect = useMutation({
    ...trpc.connectors.disconnect.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.connectors.list.queryOptions().queryKey,
      });
    },
  });
  const [errorByPlatform, setErrorByPlatform] = useState<Partial<Record<Platform, string>>>({});
  const [callbackBanner, setCallbackBanner] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(() => {
    if (connectedParam) {
      const meta = PLATFORM_META[connectedParam as Platform];
      return {
        kind: "success",
        text: meta ? `${meta.label} is connected.` : `${connectedParam} is connected.`,
      };
    }
    if (errorParam) {
      return {
        kind: "error",
        text: ERROR_COPY[errorParam] ?? decodeURIComponent(errorParam),
      };
    }
    return null;
  });

  useEffect(() => {
    if (!connectedParam && !errorParam) return;
    if (connectedParam) {
      queryClient.invalidateQueries({
        queryKey: trpc.connectors.list.queryOptions().queryKey,
      });
    }
    router.replace("/settings/connectors");
  }, [connectedParam, errorParam, router, queryClient, trpc.connectors.list]);

  const rows = DEMO_MODE ? [] : (list.data ?? []);
  const byPlatform = new Map(rows.map((r) => [r.platform, r]));

  function handleConnect(platform: Platform) {
    setErrorByPlatform((prev) => ({ ...prev, [platform]: undefined }));
    initOAuth.mutate(
      { platform },
      {
        onSuccess: ({ redirectUrl }) => {
          window.location.href = redirectUrl;
        },
        onError: (err) => {
          const message = err.message?.includes("not configured")
            ? "Set the provider's API credentials in the environment, then reload."
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
    <div className="space-y-6">
      {callbackBanner && (
        <div
          role={callbackBanner.kind === "error" ? "alert" : "status"}
          className={`flex items-start justify-between gap-3 border px-3.5 py-2.5 text-[13px] ${
            callbackBanner.kind === "error"
              ? "border-state-failed/40 bg-state-failed/5 text-state-failed"
              : "border-state-accepted/40 bg-state-accepted/5 text-state-accepted"
          }`}
        >
          <span>{callbackBanner.text}</span>
          <button
            onClick={() => setCallbackBanner(null)}
            className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      <section aria-label="External publishing">
        <div className="rule-t flex items-baseline justify-between pt-2.5">
          <h2 className="text-[15px] font-semibold">External publishing</h2>
          {DEMO_MODE && (
            <span className="spec-label">External publishing is stubbed in the demo</span>
          )}
        </div>
        <p className="mt-1.5 text-[13px] text-ink-secondary">
          OAuth flows redirect to the provider and back. Disconnect any time; auto-publish jobs
          against a dead connector fail until you reconnect.
        </p>

        <ul className="mt-2">
          {(Object.keys(PLATFORM_META) as Platform[]).map((platform) => {
            const meta = PLATFORM_META[platform];
            const row = DEMO_MODE ? undefined : byPlatform.get(platform);
            const state =
              row && row.status !== "revoked"
                ? (STATE_COPY[row.status] ?? DISCONNECTED)
                : DISCONNECTED;
            const lastError = errorByPlatform[platform];

            return (
              <li key={platform} className="hairline-b py-3 last:border-b-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13.5px] leading-tight font-semibold">{meta.label}</p>
                      <span className={`spec-label ${state.tone}`}>{state.label}</span>
                      {DEMO_MODE && <ProvenanceTag kind="stub" />}
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-ink-secondary">
                      {meta.description}
                    </p>
                  </div>
                  {row && row.status !== "revoked" ? (
                    <button
                      onClick={() => handleDisconnect(row.id, meta.label)}
                      disabled={disconnect.isPending}
                      className="btn-ghost shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(platform)}
                      disabled={DEMO_MODE || initOAuth.isPending}
                      className="btn-ink shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50"
                    >
                      {initOAuth.isPending ? "Starting…" : `Connect ${meta.label}`}
                    </button>
                  )}
                </div>
                {lastError && (
                  <p className="mt-1.5 text-[12.5px] text-state-failed">{lastError}</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <ExternalServicesSection />
    </div>
  );
}
