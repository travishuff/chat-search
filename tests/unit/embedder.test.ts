import { describe, expect, it } from "vitest";
import { chunkText } from "@/lib/embedder";

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
});
