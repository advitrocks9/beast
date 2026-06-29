import type { ToolDefinition } from "../types";
import type { Citation } from "@beast/shared";
import { retrieveSemanticMemories } from "../memory/semantic";

export function createCompanyKbTool(tenantId: string): ToolDefinition {
  return {
    name: "search_company_kb",
    description:
      "Search the company knowledge base for relevant information. Use this to find company context, brand voice guidelines, product details, audience info, or competitor intelligence. Returns the most relevant chunks. Each chunk has a citation id you must reference with [^id] markers if you use it in your final output.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant company knowledge",
        },
        topK: {
          type: "number",
          description: "Number of results to return (default: 5)",
        },
      },
      required: ["query"],
    },
    execute: async (input) => {
      const query = input.query as string;
      const topK = (input.topK as number) ?? 5;

      const results = await retrieveSemanticMemories(tenantId, query, topK);

      if (results.length === 0) {
        return {
          text: "No relevant information found in the company knowledge base.",
          citations: [],
        };
      }

      const citations: Citation[] = [];
      const lines = results.map((r) => {
        const ref = r.sourceRef;
        if (!ref) {
          return `(score: ${r.score.toFixed(2)}) ${r.content}`;
        }
        const id = `kb-${ref.chunkId.slice(0, 8)}`;
        const snippet = r.content.slice(0, 240);
        citations.push({
          id,
          type: "kb",
          title: `${ref.category}/${ref.title}`,
          snippet,
          toolName: "search_company_kb",
        });
        return `[^${id}] (score: ${r.score.toFixed(2)}) ${r.content}`;
      });

      return {
        text: lines.join("\n\n"),
        citations,
      };
    },
  };
}
