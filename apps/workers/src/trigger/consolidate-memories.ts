import { task } from "@trigger.dev/sdk";
import { consolidateMemories, detectDrift } from "@beast/ai";

interface ConsolidatePayload {
  agentId: string;
  tenantId: string;
}

/**
 * Nightly memory consolidation job per agent.
 * Groups unconsolidated episodes, extracts patterns via LLM,
 * promotes high-confidence patterns to procedural memory,
 * and decays stale episodes.
 *
 * Scheduled by the orchestrator or triggered manually.
 */
export const consolidateMemoriesJob = task({
  id: "consolidate-memories",
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: ConsolidatePayload) => {
    const result = await consolidateMemories(payload.agentId, payload.tenantId);

    return {
      agentId: payload.agentId,
      patternsExtracted: result.patternsExtracted,
      episodesConsolidated: result.episodesConsolidated,
      episodesDecayed: result.episodesDecayed,
    };
  },
});
