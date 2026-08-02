import fs from "fs";
import path from "path";
import { UnifiedConversation, UnifiedMessage } from "./types";

/**
 * ChatGPT's conversations.json stores each conversation as a message tree
 * (regenerations/edits create branches). Walking parent links from
 * current_node yields the canonical linear thread.
 */
interface ChatGPTNode {
  id: string;
  parent: string | null;
  children: string[];
  message: {
    author: { role: string };
    content?: { content_type: string; parts?: unknown[] };
    create_time?: number | null;
    metadata?: {
      model_slug?: string;
      is_visually_hidden_from_conversation?: boolean;
    };
  } | null;
}

interface ChatGPTConversation {
  id?: string;
  conversation_id?: string;
  title: string;
  create_time: number;
  update_time: number;
  current_node: string;
  mapping: Record<string, ChatGPTNode>;
}

/**
 * Accepts either a single conversations.json (pre-2026 exports) or a directory
 * containing sharded conversations-NNN.json files (current exports).
 */
export function parseChatGPT(jsonPathOrDir: string): UnifiedConversation[] {
  const files = fs.statSync(jsonPathOrDir).isDirectory()
    ? fs
        .readdirSync(jsonPathOrDir)
        .filter((f) => /^conversations(-\d+)?\.json$/.test(f))
        .sort()
        .map((f) => path.join(jsonPathOrDir, f))
    : [jsonPathOrDir];
  if (!files.length) {
    console.warn(`[chatgpt] no conversations*.json found in ${jsonPathOrDir}`);
    return [];
  }
  const data: ChatGPTConversation[] = files.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf-8")));

  return data
    .map((c) => {
      const nativeId = c.conversation_id ?? c.id ?? null;
      return {
        source: "chatgpt" as const,
        nativeId,
        title: c.title || "Untitled",
        createdAt: c.create_time ? Math.round(c.create_time * 1000) : null,
        updatedAt: c.update_time ? Math.round(c.update_time * 1000) : null,
        originalUrl: nativeId ? `https://chatgpt.com/c/${nativeId}` : null,
        messages: linearize(c),
      };
    })
    .filter((c) => c.messages.length > 0);
}

function linearize(convo: ChatGPTConversation): UnifiedMessage[] {
  const out: UnifiedMessage[] = [];
  let nodeId: string | null = convo.current_node;
  while (nodeId) {
    const node: ChatGPTNode | undefined = convo.mapping[nodeId];
    if (!node) break;
    const m = node.message;
    if (
      m &&
      m.content?.parts?.length &&
      m.author.role !== "system" &&
      !m.metadata?.is_visually_hidden_from_conversation
    ) {
      const textParts = m.content.parts.filter((p): p is string => typeof p === "string");
      const nonText = m.content.parts.length - textParts.length;
      const text = textParts.join("\n").trim();
      if (text) {
        out.push({
          role: m.author.role === "user" ? "user" : m.author.role === "tool" ? "tool" : "assistant",
          text,
          createdAt: m.create_time ? Math.round(m.create_time * 1000) : null,
          model: m.metadata?.model_slug ?? null,
          meta: nonText > 0 ? { nonTextParts: nonText } : undefined,
        });
      }
    }
    nodeId = node.parent;
  }
  return out.reverse();
}
