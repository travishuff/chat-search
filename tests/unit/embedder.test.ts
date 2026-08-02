import { afterEach, describe, expect, it, vi } from "vitest";
import { chunkText, embedPassages, embedQuery } from "@/lib/embedder";

afterEach(() => vi.unstubAllEnvs());

describe("chunkText", () => {
  it("does not create chunks for empty text", () => {
    expect(chunkText("  \n\n  ")).toEqual([]);
  });

  it("leaves short text intact", () => {
    expect(chunkText("one short message", 50)).toEqual(["one short message"]);
  });

  it("packs paragraphs without exceeding the target size", () => {
    expect(chunkText("alpha\n\nbeta\n\ngamma", 11)).toEqual(["alpha\n\nbeta", "gamma"]);
  });

  it("hard-splits oversized paragraphs and removes empty chunks", () => {
    expect(chunkText(`\n\n${"x".repeat(12)}\n\n`, 5)).toEqual(["xxxxx", "xxxxx", "xx"]);
  });

  it("provides normalized, repeatable embeddings without loading a model in deterministic mode", async () => {
    vi.stubEnv("CHAT_SEARCH_EMBEDDING_MODE", "deterministic");

    const [passage] = await embedPassages(["Quasar light"]);
    const query = await embedQuery("Quasar light");

    expect(passage).toEqual(query);
    expect(passage).toHaveLength(384);
    expect(Math.hypot(...passage)).toBeCloseTo(1);
  });
});
