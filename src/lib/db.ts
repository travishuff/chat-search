import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";

// Cache on globalThis so Next.js dev-mode HMR reuses one connection instead of
// leaking a new one per module reload.
const globalForDb = globalThis as unknown as { __chatSearchDb?: Database.Database };

export function getDb(): Database.Database {
  if (globalForDb.__chatSearchDb) return globalForDb.__chatSearchDb;
  const dbPath = process.env.CHAT_SEARCH_DB_PATH ?? path.join(process.cwd(), "data", "app.db");
  const db = createDb(dbPath);
  globalForDb.__chatSearchDb = db;
  return db;
}

/** Open and initialize a database. Exported so tests and tools can use an isolated database. */
export function createDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  sqliteVec.load(db);
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK (source IN ('chatgpt','claude','gemini')),
      native_id TEXT,
      title TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      original_url TEXT,
      fidelity TEXT NOT NULL DEFAULT 'export'
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
      text TEXT NOT NULL,
      created_at INTEGER,
      position INTEGER NOT NULL,
      model TEXT,
      meta TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_convo ON messages(conversation_id, position);

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      text, content='messages', content_rowid='rowid', tokenize='porter unicode61'
    );

    -- External-content FTS5 must be kept in sync manually; triggers make that
    -- automatic and ordering-proof (the 'delete' command form works even after
    -- the content row is gone, unlike a bare DELETE against the fts table).
    CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts (rowid, text) VALUES (new.rowid, new.text);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts (messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE OF text ON messages BEGIN
      INSERT INTO messages_fts (messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
      INSERT INTO messages_fts (rowid, text) VALUES (new.rowid, new.text);
    END;

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_message ON chunks(message_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(
      chunk_id INTEGER PRIMARY KEY,
      embedding FLOAT[384]
    );
  `);
}

/** Replace all data for one source atomically (imports are source-wise rebuilds). */
export function clearSource(db: Database.Database, source: string) {
  const convoIds = db
    .prepare("SELECT id FROM conversations WHERE source = ?")
    .all(source)
    .map((r: any) => r.id);
  const delVec = db.prepare(
    "DELETE FROM chunk_vectors WHERE chunk_id IN (SELECT c.id FROM chunks c JOIN messages m ON m.id = c.message_id WHERE m.conversation_id = ?)"
  );
  const delChunks = db.prepare(
    "DELETE FROM chunks WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?)"
  );
  const delMsgs = db.prepare("DELETE FROM messages WHERE conversation_id = ?");
  const delConvo = db.prepare("DELETE FROM conversations WHERE id = ?");
  for (const id of convoIds) {
    delVec.run(id);
    delChunks.run(id);
    delMsgs.run(id); // messages_fts_ad trigger keeps the FTS index in sync
    delConvo.run(id);
  }
}
