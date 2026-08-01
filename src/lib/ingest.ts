import type Database from "better-sqlite3";
import crypto from "crypto";
import { clearSource } from "./db";
import { chunkText, embedPassages } from "./embedder";
import { UnifiedConversation } from "./importers/types";

const EMBED_BATCH = 32;

export async function ingest(
  db: Database.Database,
  source: string,
  conversations: UnifiedConversation[],
  onProgress?: (done: number, total: number, phase: string) => void
) {
  // Source-wise rebuild keeps imports idempotent without diffing.
  const insertConvo = db.prepare(`
    INSERT INTO conversations (id, source, native_id, title, created_at, updated_at, original_url, fidelity)
    VALUES (@id, @source, @nativeId, @title, @createdAt, @updatedAt, @originalUrl, 'export')
  `);
  const insertMsg = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, text, created_at, position, model, meta)
    VALUES (@id, @conversationId, @role, @text, @createdAt, @position, @model, @meta)
  `);
  const insertFts = db.prepare(
    "INSERT INTO messages_fts (rowid, text) SELECT rowid, text FROM messages WHERE id = ?"
  );
  const insertChunk = db.prepare(
    "INSERT INTO chunks (message_id, chunk_index, text) VALUES (?, ?, ?) RETURNING id"
  );

  const allChunks: { chunkId: number; text: string }[] = [];

  db.transaction(() => {
    clearSource(db, source);
    for (const convo of conversations) {
      const convoId = `${source}:${convo.nativeId ?? hash(convo.title + convo.createdAt)}`;
      insertConvo.run({
        id: convoId,
        source,
        nativeId: convo.nativeId,
        title: convo.title,
        createdAt: convo.createdAt,
        updatedAt: convo.updatedAt,
        originalUrl: convo.originalUrl,
      });
      convo.messages.forEach((m, i) => {
        const msgId = `${convoId}:${i}`;
        insertMsg.run({
          id: msgId,
          conversationId: convoId,
          role: m.role,
          text: m.text,
          createdAt: m.createdAt,
          position: i,
          model: m.model ?? null,
          meta: m.meta ? JSON.stringify(m.meta) : null,
        });
        insertFts.run(msgId);
        chunkText(m.text).forEach((chunk, ci) => {
          const { id } = insertChunk.get(msgId, ci, chunk) as { id: number };
          allChunks.push({ chunkId: id, text: chunk });
        });
      });
    }
  })();

  const insertVec = db.prepare(
    "INSERT INTO chunk_vectors (chunk_id, embedding) VALUES (?, ?)"
  );
  for (let i = 0; i < allChunks.length; i += EMBED_BATCH) {
    const batch = allChunks.slice(i, i + EMBED_BATCH);
    const vectors = await embedPassages(batch.map((c) => c.text));
    db.transaction(() => {
      batch.forEach((c, j) => insertVec.run(BigInt(c.chunkId), Buffer.from(vectors[j].buffer)));
    })();
    onProgress?.(Math.min(i + EMBED_BATCH, allChunks.length), allChunks.length, "embedding");
  }

  return { conversations: conversations.length, chunks: allChunks.length };
}

function hash(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}
