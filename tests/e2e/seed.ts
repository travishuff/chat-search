import fs from "node:fs";
import path from "node:path";
import { createDb } from "../../src/lib/db";

export const E2E_DB_PATH = path.join(__dirname, ".tmp", "e2e.db");

/**
 * Seed a file-based test database the webServer reads via CHAT_SEARCH_DB_PATH.
 * Runs as part of the webServer command (NOT Playwright globalSetup — Playwright
 * launches web servers before globalSetup, so seeding there is too late).
 * Rows are inserted directly (FTS stays in sync via the messages triggers);
 * chunk vectors are hand-built one-hots so no embedding model is needed to seed.
 * The server still embeds queries for the KNN leg — with this tiny corpus the
 * assertions rely on keyword relevance, not semantic ranking.
 */
function seedDatabase() {
  fs.rmSync(path.dirname(E2E_DB_PATH), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(E2E_DB_PATH), { recursive: true });
  const db = createDb(E2E_DB_PATH);

  const insertConvo = db.prepare(
    `INSERT INTO conversations (id, source, native_id, title, created_at, updated_at, original_url, fidelity)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'export')`
  );
  const insertMsg = db.prepare(
    `INSERT INTO messages (id, conversation_id, role, text, created_at, position, model, meta)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`
  );
  const insertChunk = db.prepare(
    "INSERT INTO chunks (message_id, chunk_index, text) VALUES (?, 0, ?) RETURNING id"
  );
  const insertVec = db.prepare("INSERT INTO chunk_vectors (chunk_id, embedding) VALUES (?, ?)");

  const seed = (
    convoId: string,
    source: string,
    nativeId: string,
    title: string,
    url: string,
    texts: [role: string, text: string][],
    vectorDim: number
  ) => {
    const t0 = Date.UTC(2025, 6, 10, 12);
    insertConvo.run(convoId, source, nativeId, title, t0, t0 + texts.length * 60_000, url);
    texts.forEach(([role, text], i) => {
      const msgId = `${convoId}:${i}`;
      insertMsg.run(msgId, convoId, role, text, t0 + i * 60_000, i);
      const { id: chunkId } = insertChunk.get(msgId, text) as { id: number };
      const vec = new Float32Array(384);
      vec[vectorDim] = 1;
      insertVec.run(BigInt(chunkId), Buffer.from(vec.buffer));
    });
  };

  // Filler turns push the target message below the fold so the scroll-to-match
  // assertion is meaningful.
  const filler: [string, string][] = Array.from({ length: 5 }, (_, i) => [
    ["user", `Observation log entry number ${i + 1}, nothing unusual tonight.`],
    ["assistant", `Noted. Log entry ${i + 1} recorded without incident or anomaly.`],
  ]).flat() as [string, string][];

  seed(
    "chatgpt:e2e-space",
    "chatgpt",
    "e2e-space",
    "Quasar observations",
    "https://chatgpt.com/c/e2e-space",
    [
      ...filler,
      ["user", "What exactly is a quasar?"],
      ["assistant", "A quasar is an extremely luminous active galactic nucleus powered by accretion."],
    ],
    0
  );

  seed(
    "claude:e2e-bread",
    "claude",
    "e2e-bread",
    "Sourdough starter help",
    "https://claude.ai/chat/e2e-bread",
    [
      ["user", "My sourdough starter smells like acetone."],
      ["assistant", "An acetone smell means the sourdough starter is hungry — feed it more often."],
    ],
    1
  );

  db.close();
}

seedDatabase();
console.log(`[e2e] seeded test database at ${E2E_DB_PATH}`);
