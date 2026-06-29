import type { AppliedRule, RetrievedMemory } from "../types";
import { retrieveSemanticMemories } from "./semantic";
import { retrieveEpisodicMemories } from "./episodic";
import { retrieveProceduralMemories, retrieveAppliedRules } from "./procedural";

export { indexKnowledgeItem, retrieveSemanticMemories, deleteKnowledgeEmbeddings } from "./semantic";
export { storeEpisode, retrieveEpisodicMemories } from "./episodic";
export { retrieveProceduralMemories, retrieveAppliedRules, upsertProceduralRule, rollbackRule } from "./procedural";
export { embed, embedBatch, chunkText } from "./embeddings";
export { extractFromTaskCompletion, extractFromFeedback, extractRuleFromRationale, storeApprovedExample } from "./extraction";
export { consolidateMemories, detectDrift } from "./consolidation";

interface MemoryLoadResult {
  episodic: RetrievedMemory[];
  semantic: RetrievedMemory[];
  procedural: RetrievedMemory[];
  appliedRules: AppliedRule[];
}

/**
 * Load all memory layers in parallel for a task execution.
 * This is the main entry point called at the start of every agent run.
 */
export async function loadMemories(opts: {
  agentId: string;
  tenantId: string;
  query: string;
  taskType?: string;
  topKSemantic?: number;
  topKEpisodic?: number;
  topKProcedural?: number;
}): Promise<MemoryLoadResult> {
  const [episodic, semantic, procedural, appliedRules] = await Promise.all([
    retrieveEpisodicMemories(opts.agentId, opts.tenantId, opts.query, opts.topKEpisodic ?? 5),
    retrieveSemanticMemories(opts.tenantId, opts.query, opts.topKSemantic ?? 8),
    retrieveProceduralMemories(opts.agentId, opts.tenantId, opts.taskType, opts.topKProcedural ?? 30),
    retrieveAppliedRules(opts.agentId, opts.tenantId, opts.taskType, opts.topKProcedural ?? 30),
  ]);

  return { episodic, semantic, procedural, appliedRules };
}
