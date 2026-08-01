export type Role = "user" | "assistant" | "system" | "tool";

export interface UnifiedMessage {
  role: Role;
  text: string;
  createdAt: number | null; // unix ms
  model?: string | null;
  meta?: Record<string, unknown>;
}

export interface UnifiedConversation {
  source: "chatgpt" | "claude" | "gemini";
  nativeId: string | null;
  title: string;
  createdAt: number | null;
  updatedAt: number | null;
  originalUrl: string | null;
  messages: UnifiedMessage[];
}
