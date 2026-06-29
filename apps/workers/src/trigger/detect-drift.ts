import { task } from "@trigger.dev/sdk";
import { detectDrift } from "@beast/ai";

interface DetectDriftPayload {
  agentId: string;
  tenantId: string;
}

/**
 * Daily drift detection job per agent.
 * Checks procedural rules for degraded approval rates,
 * auto-rolls back or deprecates negative-delta rules.
 *
 * Scheduled by the orchestrator or triggered manually.
 */
export const detectDriftJob = task({
  id: "detect-drift",
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: DetectDriftPayload) => {
    const result = await detectDrift(payload.agentId, payload.tenantId);

    return {
      agentId: payload.agentId,
      rulesRolledBack: result.rulesRolledBack,
      rulesDeprecated: result.rulesDeprecated,
    };
  },
});
