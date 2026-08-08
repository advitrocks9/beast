import { GoogleGenAI } from "@google/genai";
import { env } from "@beast/shared/env";

// Must match the pgvector column width in packages/db (vector("embedding", { dimensions: 1536 })).
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_MODEL = "gemini-embedding-2-preview";

let _client: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return _client;
}

export async function embed(
  texts: string[],
  kind: "query" | "document" = "document",
): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (!env.GEMINI_API_KEY) {
    return texts.map(hashEmbed);
  }

  const response = await getGeminiClient().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
    },
  });
  return response.embeddings!.map((e) => e.values!);
}

// Deterministic local embedder so pgvector paths stay exercised without a key.
function hashEmbed(text: string): number[] {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) {
    seed ^= text.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  let state = seed >>> 0;
  const vector = new Array<number>(EMBEDDING_DIMENSIONS);
  let magnitude = 0;
  for (let d = 0; d < EMBEDDING_DIMENSIONS; d++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const value = (state / 0xffffffff) * 2 - 1;
    vector[d] = value;
    magnitude += value * value;
  }

  magnitude = Math.sqrt(magnitude);
  for (let d = 0; d < EMBEDDING_DIMENSIONS; d++) {
    vector[d] = vector[d]! / magnitude;
  }
  return vector;
}
