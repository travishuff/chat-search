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

/** Build SQL conditions applying filters to message m / conversation c. */
function filterSql(filters: SearchFilters): { conds: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters.sources?.length) {
    conds.push(`c.source IN (${filters.sources.map(() => "?").join(",")})`);
    params.push(...filters.sources);
  }
  if (filters.role) {
    conds.push("m.role = ?");
    params.push(filters.role);
  }
  if (filters.after) {
    conds.push("COALESCE(m.created_at, c.created_at) >= ?");
    params.push(filters.after);
  }
  if (filters.before) {
    conds.push("COALESCE(m.created_at, c.created_at) <= ?");
    params.push(filters.before);
  }
  return { conds: conds.length ? " AND " + conds.join(" AND ") : "", params };
}

export async function search(query: string, filters: SearchFilters = {}, limit = 30): Promise<SearchResult[]> {
  const db = getDb();
  const { conds, params } = filterSql(filters);

  // --- keyword leg (BM25), filters applied before the candidate cap ---
  const ftsQuery = query
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, "")}"`)
    .join(" ");
  let ftsRows: { id: string }[] = [];
  if (ftsQuery) {
    ftsRows = db
      .prepare(
        `SELECT m.id FROM messages_fts f
         JOIN messages m ON m.rowid = f.rowid
         JOIN conversations c ON c.id = m.conversation_id
         WHERE messages_fts MATCH ?${conds}
         ORDER BY rank LIMIT ?`
      )
      .all(ftsQuery, ...params, CANDIDATES) as any[];
  }

  // --- semantic leg (KNN over chunks, best chunk per message) ---
  // vec0 KNN can't join, so pre-filter by handing it the eligible chunk-id set.
  const qvec = await embedQuery(query);
  const hasFilters = conds.length > 0;
  const knnParams: unknown[] = [Buffer.from(qvec.buffer), CANDIDATES];
  let idConstraint = "";
  if (hasFilters) {
    idConstraint = `AND chunk_id IN (
      SELECT ch.id FROM chunks ch
      JOIN messages m ON m.id = ch.message_id
      JOIN conversations c ON c.id = m.conversation_id
      WHERE 1=1${conds})`;
    knnParams.push(...params);
  }
  const knnRows = db
    .prepare(
      `SELECT c2.message_id AS id, MIN(v.distance) AS distance
       FROM (SELECT chunk_id, distance FROM chunk_vectors
             WHERE embedding MATCH ? AND k = ? ${idConstraint}) v
       JOIN chunks c2 ON c2.id = v.chunk_id
       GROUP BY c2.message_id ORDER BY distance`
    )
    .all(...knnParams) as { id: string; distance: number }[];

  // --- reciprocal rank fusion ---
  const scores = new Map<string, number>();
  ftsRows.forEach((r, i) => scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (K + i + 1)));
  knnRows.forEach((r, i) => scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (K + i + 1)));

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);

  // --- hydrate (filters already applied in both legs) ---
  const getMsg = db.prepare(`
    SELECT m.id AS messageId, m.role, m.text,
           c.id AS conversationId, c.source, c.title, c.original_url AS originalUrl,
           c.created_at AS conversationDate
    FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ?
  `);

  const results: SearchResult[] = [];
  const seenConvos = new Map<string, number>();
  for (const [id, score] of ranked) {
    const row = getMsg.get(id) as any;
    if (!row) continue;
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
