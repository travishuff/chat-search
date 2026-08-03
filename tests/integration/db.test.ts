import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb, getDb } from "@/lib/db";

const temporaryDirs: string[] = [];

afterEach(() => {
  temporaryDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  vi.unstubAllEnvs();
  delete (globalThis as typeof globalThis & { __chatSearchDb?: unknown }).__chatSearchDb;
});

describe("createDb", () => {
  it("creates a configured database directory and initializes the schema", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "recall-db-test-"));
    temporaryDirs.push(root);
    const dbPath = path.join(root, "persistent", "recall", "app.db");

    const db = createDb(dbPath);
    try {
      expect(fs.existsSync(dbPath)).toBe(true);
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'conversations'").get()
      ).toEqual({ name: "conversations" });
    } finally {
      db.close();
    }
  });
});

describe("getDb in production", () => {
  it("requires an explicit database path", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHAT_SEARCH_DB_PATH", "");

    expect(() => getDb()).toThrow("CHAT_SEARCH_DB_PATH is required in production");
  });

  it("refuses to start with a missing database file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "recall-db-test-"));
    temporaryDirs.push(root);
    const missingPath = path.join(root, "missing.db");

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHAT_SEARCH_DB_PATH", missingPath);

    expect(() => getDb()).toThrow(`Production database does not exist at ${missingPath}`);
    expect(fs.existsSync(missingPath)).toBe(false);
  });
});
