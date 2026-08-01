import { getDb } from "./db";
import { embedQuery } from "./embedder";

export interface SearchFilters {
  sources?: string[];
  role?: string;
  after?: number; // unix ms
  before?: number;
}

export interface SearchResult {
  conversationId: string;
  source: string;
  title: string;
  originalUrl: string | null;
  conversationDate: number | null;
  messageId: string;
  role: string;
  snippet: string;
  score: number;
}

const K = 60; // RRF constant
const CANDIDATES = 80;

export async function search(query: string, filters: SearchFilters = {}, limit = 30): Promise<SearchResult[]> {
  const db = getDb();

  // --- keyword leg (BM25) ---
  const ftsQuery = query
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, "")}"`)
    .join(" ");
  let ftsRows: { id: string; rank: number }[] = [];
  if (ftsQuery) {
    ftsRows = db
      .prepare(
        `SELECT m.id, rank FROM messages_fts f JOIN messages m ON m.rowid = f.rowid
         WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?`
      )
      .all(ftsQuery, CANDIDATES) as any[];
  }

  // --- semantic leg (KNN over chunks, best chunk per message) ---
  const qvec = await embedQuery(query);
  const knnRows = db
    .prepare(
      `SELECT c.message_id AS id, MIN(v.distance) AS distance
       FROM (SELECT chunk_id, distance FROM chunk_vectors WHERE embedding MATCH ? AND k = ?) v
       JOIN chunks c ON c.id = v.chunk_id
       GROUP BY c.message_id ORDER BY distance`
    )
    .all(Buffer.from(qvec.buffer), CANDIDATES) as { id: string; distance: number }[];

  // --- reciprocal rank fusion ---
  const scores = new Map<string, number>();
  ftsRows.forEach((r, i) => scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (K + i + 1)));
  knnRows.forEach((r, i) => scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (K + i + 1)));

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);

  // --- hydrate + filter ---
  const getMsg = db.prepare(`
    SELECT m.id AS messageId, m.role, m.text, m.created_at AS msgDate,
           c.id AS conversationId, c.source, c.title, c.original_url AS originalUrl,
           c.created_at AS conversationDate
    FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ?
  `);

  const results: SearchResult[] = [];
  const seenConvos = new Map<string, number>();
  for (const [id, score] of ranked) {
    const row = getMsg.get(id) as any;
    if (!row) continue;
    if (filters.sources?.length && !filters.sources.includes(row.source)) continue;
    if (filters.role && row.role !== filters.role) continue;
    const d = row.msgDate ?? row.conversationDate;
    if (filters.after && (!d || d < filters.after)) continue;
    if (filters.before && (!d || d > filters.before)) continue;
    // Cap per-conversation results so one long chat doesn't flood the page.
    const perConvo = seenConvos.get(row.conversationId) ?? 0;
    if (perConvo >= 3) continue;
    seenConvos.set(row.conversationId, perConvo + 1);

    results.push({
      conversationId: row.conversationId,
      source: row.source,
      title: row.title,
      originalUrl: row.originalUrl,
      conversationDate: row.conversationDate,
      messageId: row.messageId,
      role: row.role,
      snippet: makeSnippet(row.text, query),
      score,
    });
    if (results.length >= limit) break;
  }
  return results;
}

function makeSnippet(text: string, query: string, span = 240): string {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const lower = text.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) return text.slice(0, span) + (text.length > span ? "…" : "");
  const start = Math.max(0, pos - span / 3);
  const end = Math.min(text.length, start + span);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}
