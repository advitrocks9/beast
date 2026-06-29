import type { ToolDefinition } from "../types";
import type { Citation } from "@beast/shared";

interface FirecrawlScrapeResponse {
  success: boolean;
  data: {
    markdown: string;
    metadata: {
      title: string;
      description: string;
    };
  };
}

function deriveDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 8);
}

export function createCompetitorScanTool(): ToolDefinition {
  return {
    name: "scan_competitor_website",
    description:
      "Crawl and extract content from a competitor's website page. Use for analyzing competitor positioning, pricing, features, or content strategy. Returns the page content as markdown plus a citation id. Reference the source in your final output with a [^id] marker.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to crawl (e.g., a competitor's pricing or features page)",
        },
      },
      required: ["url"],
    },
    execute: async (input) => {
      const url = input.url as string;

      const apiKey = process.env.FIRECRAWL_API_KEY;
      if (!apiKey) {
        return {
          text: "Competitor scanning is not configured. FIRECRAWL_API_KEY is missing.",
          citations: [],
        };
      }

      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return {
          text: `Failed to scan URL: ${response.status} ${response.statusText}`,
          citations: [],
        };
      }

      const data = (await response.json()) as FirecrawlScrapeResponse;

      if (!data.success) {
        return { text: "Failed to extract content from the URL.", citations: [] };
      }

      const title = data.data.metadata.title || "Unknown page";
      const content = data.data.markdown;
      const truncated = content.length > 4000 ? content.slice(0, 4000) + "\n\n[...truncated]" : content;

      const id = `competitor-${shortHash(url)}`;
      const domain = deriveDomain(url);
      const citations: Citation[] = [
        {
          id,
          type: "web",
          title,
          url,
          domain,
          snippet: data.data.metadata.description?.slice(0, 240) ?? truncated.slice(0, 240),
          toolName: "scan_competitor_website",
        },
      ];

      return {
        text: `[^${id}] # ${title}\n\n${truncated}`,
        citations,
      };
    },
  };
}
