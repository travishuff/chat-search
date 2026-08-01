import fs from "fs";
import { UnifiedConversation, UnifiedMessage } from "./types";

interface ClaudeContentBlock {
  type: string;
  text?: string;
}

interface ClaudeMessage {
  uuid: string;
  text: string;
  content: ClaudeContentBlock[];
  sender: "human" | "assistant";
  created_at: string;
  attachments: unknown[];
  files: unknown[];
}

interface ClaudeConversation {
  uuid: string;
  name: string;
  summary: string;
  created_at: string;
  updated_at: string;
  chat_messages: ClaudeMessage[];
}

export function parseClaude(conversationsJsonPath: string): UnifiedConversation[] {
  const data: ClaudeConversation[] = JSON.parse(fs.readFileSync(conversationsJsonPath, "utf-8"));

  return data
    .filter((c) => c.chat_messages.length > 0)
    .map((c) => {
      const messages: UnifiedMessage[] = c.chat_messages.map((m) => {
        const textBlocks = (m.content ?? [])
          .filter((b) => b.type === "text" && b.text)
          .map((b) => b.text!.trim());
        const text = textBlocks.length ? textBlocks.join("\n\n") : (m.text ?? "");
        const otherBlocks = (m.content ?? []).filter((b) => b.type !== "text").map((b) => b.type);
        const meta: Record<string, unknown> = {};
        if (otherBlocks.length) meta.blockTypes = otherBlocks;
        if (m.attachments?.length) meta.attachments = m.attachments;
        if (m.files?.length) meta.files = m.files;
        return {
          role: m.sender === "human" ? ("user" as const) : ("assistant" as const),
          text,
          createdAt: Date.parse(m.created_at) || null,
          meta: Object.keys(meta).length ? meta : undefined,
        };
      });

      return {
        source: "claude" as const,
        nativeId: c.uuid,
        title: c.name || c.summary?.slice(0, 80) || firstLine(messages),
        createdAt: Date.parse(c.created_at) || null,
        updatedAt: Date.parse(c.updated_at) || null,
        originalUrl: `https://claude.ai/chat/${c.uuid}`,
        messages: messages.filter((m) => m.text.trim().length > 0),
      };
    })
    .filter((c) => c.messages.length > 0);
}

function firstLine(messages: UnifiedMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.text ?? "Untitled";
  return first.split("\n")[0].slice(0, 80);
}
