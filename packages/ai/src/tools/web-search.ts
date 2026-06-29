import type { ToolDefinition } from "../types";
import type { Citation } from "@beast/shared";

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface SerperResponse {
  organic: SerperResult[];
}

function deriveDomain(link: string): string | undefined {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function createWebSearchTool(): ToolDefinition {
  return {
    name: "web_search",
    description:
      "Search the web for current information. Use for researching topics, finding statistics, checking competitor activity, or gathering recent news. Returns top results with titles, URLs, snippets, and citation ids. Reference any used result in your final output with a [^id] marker.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
        numResults: {
          type: "number",
          description: "Number of results to return (default: 5, max: 10)",
        },
      },
      required: ["query"],
    },
    execute: async (input) => {
      const query = input.query as string;
      const numResults = Math.min((input.numResults as number) ?? 5, 10);

      const apiKey = process.env.SERPER_API_KEY;
      if (!apiKey) {
        return { text: "Web search is not configured. SERPER_API_KEY is missing.", citations: [] };
      }

      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: numResults }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return {
          text: `Web search failed: ${response.status} ${response.statusText}`,
          citations: [],
        };
      }

      const data = (await response.json()) as SerperResponse;

      if (!data.organic?.length) {
        return { text: "No results found.", citations: [] };
      }

      const citations: Citation[] = [];
      const lines = data.organic.slice(0, numResults).map((r) => {
        const id = `web-${r.position}`;
        citations.push({
          id,
          type: "web",
          title: r.title,
          url: r.link,
          domain: deriveDomain(r.link),
          snippet: r.snippet,
          toolName: "web_search",
        });
        return `[^${id}] ${r.title}\n    ${r.link}\n    ${r.snippet}`;
      });

      return {
        text: lines.join("\n\n"),
        citations,
      };
    },
  };
}
