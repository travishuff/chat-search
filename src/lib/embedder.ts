import path from "path";

export const EMBEDDING_DIM = 384;
const MODEL = "Xenova/bge-small-en-v1.5";
// BGE models want a query prefix for retrieval queries, none for passages.
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
const DETERMINISTIC_MODE = "deterministic";

let pipelinePromise: Promise<any> | null = null;

async function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = process.env.CHAT_SEARCH_MODEL_CACHE_DIR ?? path.join(process.cwd(), ".model-cache");
      return pipeline("feature-extraction", MODEL, { dtype: "fp32" });
    })();
  }
  return pipelinePromise;
}

async function embed(texts: string[]): Promise<Float32Array[]> {
  const pipe = await getPipeline();
  const output = await pipe(texts, { pooling: "mean", normalize: true });
  const [n, dim] = output.dims;
  const flat: Float32Array = output.data;
  const result: Float32Array[] = [];
  for (let i = 0; i < n; i++) {
    result.push(flat.slice(i * dim, (i + 1) * dim));
  }
  return result;
}

export async function embedPassages(texts: string[]): Promise<Float32Array[]> {
  if (process.env.CHAT_SEARCH_EMBEDDING_MODE === DETERMINISTIC_MODE) {
    return texts.map(deterministicEmbedding);
  }
  return embed(texts);
}

export async function embedQuery(text: string): Promise<Float32Array> {
  if (process.env.CHAT_SEARCH_EMBEDDING_MODE === DETERMINISTIC_MODE) {
    return deterministicEmbedding(text);
  }
  const [v] = await embed([QUERY_PREFIX + text]);
  return v;
}

/** Stable local embeddings for hermetic tests; not intended for production retrieval quality. */
function deterministicEmbedding(text: string): Float32Array {
  const vector = new Float32Array(EMBEDDING_DIM);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
    }
    vector[(hash >>> 0) % EMBEDDING_DIM] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) {
    vector[0] = 1;
    return vector;
  }
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

/** Split text into ~chunks of at most maxChars, preferring paragraph breaks. */
export function chunkText(text: string, maxChars = 1500): string[] {
  if (!text.trim()) return [];
  if (text.length <= maxChars) return [text];
  const paras = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paras) {
    if (p.length > maxChars) {
      if (current) { chunks.push(current); current = ""; }
      for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars));
    } else if (current.length + p.length + 2 > maxChars) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((c) => c.trim().length > 0);
}
