import { embed as embedMany } from "../provider";

export async function embed(text: string): Promise<number[]> {
  const [vector] = await embedMany([text], "query");
  // provider embed returns one vector per input text
  return vector!;
}

export function embedBatch(texts: string[]): Promise<number[][]> {
  return embedMany(texts, "document");
}

/**
 * Chunk text into overlapping segments for embedding.
 * ~512 tokens per chunk with 50 token overlap.
 */
export function chunkText(text: string, chunkSize = 2048, overlap = 200): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start + overlap >= text.length) break;
  }

  return chunks;
}
