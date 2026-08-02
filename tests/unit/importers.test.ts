import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseChatGPT } from "@/lib/importers/chatgpt";
import { parseClaude } from "@/lib/importers/claude";
import { parseGemini } from "@/lib/importers/gemini";

const fixtureDirs: string[] = [];

function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-search-test-"));
  fixtureDirs.push(dir);
  return dir;
}

function writeJson(value: unknown, name = "fixture.json") {
  const file = path.join(makeDir(), name);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

afterEach(() => {
  fixtureDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

describe("parseChatGPT", () => {
  it("walks only the canonical branch and normalizes visible text messages", () => {
    const conversation = {
      id: "conversation-1",
      title: "Canonical thread",
      create_time: 1_700_000_000,
      update_time: 1_700_000_100,
      current_node: "assistant",
      mapping: {
        root: node("root", null, "system", ["internal instructions"]),
        user: node("user", "root", "user", ["How do stars form?"], 1_700_000_001),
        hidden: {
          ...node("hidden", "user", "assistant", ["hidden answer"]),
          message: {
            ...node("hidden", "user", "assistant", ["hidden answer"]).message,
            metadata: { is_visually_hidden_from_conversation: true },
          },
        },
        assistant: {
          ...node("assistant", "hidden", "assistant", ["From collapsing gas.", { asset: "image" }], 1_700_000_002),
          message: {
            ...node("assistant", "hidden", "assistant", ["From collapsing gas.", { asset: "image" }], 1_700_000_002)
              .message,
            metadata: { model_slug: "gpt-test" },
          },
        },
        abandoned: node("abandoned", "user", "assistant", ["wrong branch"]),
      },
    };

    const [parsed] = parseChatGPT(writeJson([conversation], "conversations.json"));

    expect(parsed).toMatchObject({
      source: "chatgpt",
      nativeId: "conversation-1",
      title: "Canonical thread",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      originalUrl: "https://chatgpt.com/c/conversation-1",
    });
    expect(parsed.messages).toEqual([
      { role: "user", text: "How do stars form?", createdAt: 1_700_000_001_000, model: null },
      {
        role: "assistant",
        text: "From collapsing gas.",
        createdAt: 1_700_000_002_000,
        model: "gpt-test",
        meta: { nonTextParts: 1 },
      },
    ]);
  });

  it("loads current sharded exports in filename order and ignores unrelated files", () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, "conversations-010.json"), JSON.stringify([simpleChat("ten")]));
    fs.writeFileSync(path.join(dir, "conversations-002.json"), JSON.stringify([simpleChat("two")]));
    fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify([simpleChat("ignored")]));

    expect(parseChatGPT(dir).map((c) => c.nativeId)).toEqual(["two", "ten"]);
  });

  it("returns an empty result and warns when an export directory has no conversation files", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dir = makeDir();

    expect(parseChatGPT(dir)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no conversations*.json found"));
  });
});

describe("parseClaude", () => {
  it("keeps text blocks, records non-text content, and applies title fallbacks", () => {
    const data = [
      {
        uuid: "claude-1",
        name: "",
        summary: "A useful fallback summary",
        created_at: "2025-01-02T03:04:05Z",
        updated_at: "not-a-date",
        chat_messages: [
          {
            uuid: "m1",
            text: "legacy text",
            content: [
              { type: "text", text: " First paragraph " },
              { type: "thinking", text: "private" },
              { type: "text", text: "Second paragraph" },
            ],
            sender: "human",
            created_at: "2025-01-02T03:04:06Z",
            attachments: [{ file_name: "notes.txt" }],
            files: ["file-ref"],
          },
          {
            uuid: "m2",
            text: "fallback answer",
            content: [],
            sender: "assistant",
            created_at: "invalid",
            attachments: [],
            files: [],
          },
        ],
      },
      {
        uuid: "empty",
        name: "Empty",
        summary: "",
        created_at: "",
        updated_at: "",
        chat_messages: [],
      },
    ];

    const [parsed] = parseClaude(writeJson(data, "conversations.json"));

    expect(parsed.title).toBe("A useful fallback summary");
    expect(parsed.updatedAt).toBeNull();
    expect(parsed.originalUrl).toBe("https://claude.ai/chat/claude-1");
    expect(parsed.messages).toEqual([
      {
        role: "user",
        text: "First paragraph\n\nSecond paragraph",
        createdAt: Date.parse("2025-01-02T03:04:06Z"),
        meta: {
          blockTypes: ["thinking"],
          attachments: [{ file_name: "notes.txt" }],
          files: ["file-ref"],
        },
      },
      { role: "assistant", text: "fallback answer", createdAt: null, meta: undefined },
    ]);
  });
});

describe("parseGemini", () => {
  it("sorts turns, clusters on the 30-minute boundary, converts HTML, and preserves attachment metadata", () => {
    const start = Date.parse("2025-02-01T10:00:00Z");
    const data = [
      {
        header: "Gemini Apps",
        title: "Prompted A separate session",
        time: new Date(start + 60 * 60 * 1000 + 1).toISOString(),
        subtitles: [{ name: "Generated image" }],
        imageFile: "image.png",
      },
      { header: "Gemini Apps", title: "Visited Gemini", time: new Date(start + 1).toISOString() },
      {
        header: "Gemini Apps",
        title: "Prompted Follow up",
        time: new Date(start + 30 * 60 * 1000).toISOString(),
        safeHtmlItem: [{ html: "<p>Second <strong>answer</strong></p>" }],
      },
      {
        header: "Gemini Apps",
        title: "Prompted First question",
        time: new Date(start).toISOString(),
        safeHtmlItem: [{ html: '<p>Hello <a href="https://example.com">world</a><img src="x"></p>' }],
        attachedFiles: ["input.pdf"],
      },
    ];

    const parsed = parseGemini(writeJson(data, "MyActivity.json"));

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      nativeId: `session-${start}`,
      title: "First question",
      createdAt: start,
      updatedAt: start + 30 * 60 * 1000,
    });
    expect(parsed[0].messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "First question"],
      ["assistant", "Hello world"],
      ["user", "Follow up"],
      ["assistant", "Second answer"],
    ]);
    expect(parsed[0].messages[0].meta).toEqual({ attachedFiles: ["input.pdf"] });
    expect(parsed[1].messages[1]).toMatchObject({
      role: "assistant",
      text: "Generated image",
      meta: { imageFile: "image.png", subtitles: ["Generated image"] },
    });
  });
});

function node(id: string, parent: string | null, role: string, parts: unknown[], createTime?: number) {
  return {
    id,
    parent,
    children: [],
    message: {
      author: { role },
      content: { content_type: "multimodal_text", parts },
      create_time: createTime ?? null,
      metadata: {},
    },
  };
}

function simpleChat(id: string) {
  return {
    id,
    title: id,
    create_time: 1,
    update_time: 2,
    current_node: "message",
    mapping: { message: node("message", null, "user", [id]) },
  };
}
