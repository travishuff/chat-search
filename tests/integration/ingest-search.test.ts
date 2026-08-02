import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function topicVector(text: string) {
  const vector = new Float32Array(384);
  const normalized = text.toLowerCase();
  if (/star|galaxy|orbit|planet|astronomy/.test(normalized)) vector[0] = 1;
  else if (/bread|dough|baking|yeast/.test(normalized)) vector[1] = 1;
  else vector[2] = 1;
  return vector;
}

vi.mock("@/lib/embedder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/embedder")>();
  return {
    ...actual,
    embedPassages: vi.fn(async (texts: string[]) => texts.map(topicVector)),
    embedQuery: vi.fn(async (text: string) => topicVector(text)),
  };
});

import { createDb } from "@/lib/db";

const dbHolder: { current?: Database.Database } = {};
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: () => dbHolder.current };
});

import { ingest } from "@/lib/ingest";
import { search } from "@/lib/search";
import type { UnifiedConversation } from "@/lib/importers/types";

beforeEach(() => {
  dbHolder.current = createDb(":memory:");
});

afterEach(() => {
  dbHolder.current?.close();
  dbHolder.current = undefined;
});

describe("database ingest and hybrid search", () => {
  it("persists normalized records, vectors, FTS rows, and progress", async () => {
    const progress = vi.fn();

    const summary = await ingest(db(), "chatgpt", [spaceConversation()], progress);

    expect(summary).toEqual({ conversations: 1, chunks: 4 });
    expect(count("conversations")).toBe(1);
    expect(count("messages")).toBe(4);
    expect(count("chunks")).toBe(4);
    expect(count("chunk_vectors")).toBe(4);
    expect(
      db().prepare("SELECT COUNT(*) AS n FROM messages_fts WHERE messages_fts MATCH 'astronomy'").get()
    ).toEqual({ n: 4 });
    expect(progress).toHaveBeenLastCalledWith(4, 4, "embedding");
  });

  it("replaces one source atomically without disturbing another source or stale FTS data", async () => {
    await ingest(db(), "chatgpt", [spaceConversation()]);
    await ingest(db(), "claude", [breadConversation()]);

    await ingest(db(), "chatgpt", [replacementConversation()]);

    expect(
      db().prepare("SELECT id FROM conversations ORDER BY source").all()
    ).toEqual([{ id: "chatgpt:replacement" }, { id: "claude:bread" }]);
    expect(
      db().prepare("SELECT COUNT(*) AS n FROM messages_fts WHERE messages_fts MATCH 'astronomy'").get()
    ).toEqual({ n: 0 });
    expect(
      db().prepare("SELECT COUNT(*) AS n FROM messages_fts WHERE messages_fts MATCH 'sourdough'").get()
    ).toEqual({ n: 1 });
    expect(count("chunk_vectors")).toBe(3);
  });

  it("fuses lexical and semantic ranks, applies filters, and caps repeated conversation hits", async () => {
    await ingest(db(), "chatgpt", [spaceConversation()]);
    await ingest(db(), "claude", [breadConversation()]);

    const semantic = await search("galaxy", {}, 10);
    expect(semantic[0]).toMatchObject({
      conversationId: "chatgpt:space",
      source: "chatgpt",
    });
    expect(semantic.filter((result) => result.conversationId === "chatgpt:space")).toHaveLength(3);

    const filtered = await search(
      "bread",
      { sources: ["claude"], role: "assistant", after: Date.UTC(2024, 0, 1), before: Date.UTC(2026, 0, 1) },
      10
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({
      conversationId: "claude:bread",
      role: "assistant",
      snippet: "Use a lively sourdough starter for bread dough.",
    });

    await expect(search("bread", { sources: ["gemini"] }, 10)).resolves.toEqual([]);
  });
});

function db() {
  if (!dbHolder.current) throw new Error("test database is not initialized");
  return dbHolder.current;
}

function count(table: string) {
  return (db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function spaceConversation(): UnifiedConversation {
  return {
    source: "chatgpt",
    nativeId: "space",
    title: "Astronomy notes",
    createdAt: Date.UTC(2024, 5, 1),
    updatedAt: Date.UTC(2024, 5, 2),
    originalUrl: "https://chatgpt.com/c/space",
    messages: [
      { role: "user", text: "Explain astronomy and stars", createdAt: Date.UTC(2024, 5, 1) },
      { role: "assistant", text: "Astronomy studies every star and galaxy", createdAt: Date.UTC(2024, 5, 1) },
      { role: "user", text: "More astronomy about planetary orbit", createdAt: Date.UTC(2024, 5, 1) },
      { role: "assistant", text: "Astronomy connects an orbit to its star", createdAt: Date.UTC(2024, 5, 1) },
    ],
  };
}

function breadConversation(): UnifiedConversation {
  return {
    source: "claude",
    nativeId: "bread",
    title: "Bread notes",
    createdAt: Date.UTC(2025, 2, 1),
    updatedAt: Date.UTC(2025, 2, 1),
    originalUrl: "https://claude.ai/chat/bread",
    messages: [
      { role: "user", text: "How should I bake bread?", createdAt: Date.UTC(2025, 2, 1) },
      {
        role: "assistant",
        text: "Use a lively sourdough starter for bread dough.",
        createdAt: Date.UTC(2025, 2, 1),
      },
    ],
  };
}

function replacementConversation(): UnifiedConversation {
  return {
    source: "chatgpt",
    nativeId: "replacement",
    title: "Replacement",
    createdAt: Date.UTC(2026, 0, 1),
    updatedAt: Date.UTC(2026, 0, 1),
    originalUrl: null,
    messages: [{ role: "user", text: "Completely unrelated replacement", createdAt: null }],
  };
}
