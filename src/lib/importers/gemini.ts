import fs from "fs";
import { convert } from "html-to-text";
import { UnifiedConversation, UnifiedMessage } from "./types";

/**
 * Gemini's Takeout export is a flat activity log: one entry per prompt/response
 * turn, newest first, with no conversation identifiers. We regroup turns into
 * conversations by time-gap clustering.
 */
const SESSION_GAP_MS = 30 * 60 * 1000;

interface GeminiActivityEntry {
  header: string;
  title: string;
  time: string;
  subtitles?: { name: string }[];
  safeHtmlItem?: { html: string }[];
  attachedFiles?: string[];
  imageFile?: string;
}

export function parseGemini(myActivityJsonPath: string): UnifiedConversation[] {
  const data: GeminiActivityEntry[] = JSON.parse(fs.readFileSync(myActivityJsonPath, "utf-8"));

  const turns = data
    .filter((e) => e.title.startsWith("Prompted "))
    .map((e) => ({
      prompt: e.title.slice("Prompted ".length),
      responseHtml: (e.safeHtmlItem ?? []).map((s) => s.html).join("\n"),
      time: Date.parse(e.time),
      attachedFiles: e.attachedFiles,
      imageFile: e.imageFile,
      subtitles: e.subtitles?.map((s) => s.name),
    }))
    .sort((a, b) => a.time - b.time);

  // Cluster ascending turns into sessions on the time gap.
  const clusters: (typeof turns)[] = [];
  for (const turn of turns) {
    const current = clusters[clusters.length - 1];
    if (current && turn.time - current[current.length - 1].time <= SESSION_GAP_MS) {
      current.push(turn);
    } else {
      clusters.push([turn]);
    }
  }

  return clusters.map((cluster) => {
    const messages: UnifiedMessage[] = [];
    for (const t of cluster) {
      const userMeta: Record<string, unknown> = {};
      if (t.attachedFiles?.length) userMeta.attachedFiles = t.attachedFiles;
      messages.push({
        role: "user",
        text: t.prompt,
        createdAt: t.time,
        meta: Object.keys(userMeta).length ? userMeta : undefined,
      });
      const responseText = t.responseHtml
        ? convert(t.responseHtml, {
            wordwrap: false,
            selectors: [
              { selector: "a", options: { ignoreHref: true } },
              { selector: "img", format: "skip" },
            ],
          }).trim()
        : "";
      const asstMeta: Record<string, unknown> = {};
      if (t.imageFile) asstMeta.imageFile = t.imageFile;
      if (t.subtitles?.length) asstMeta.subtitles = t.subtitles;
      if (responseText || Object.keys(asstMeta).length) {
        messages.push({
          role: "assistant",
          text: responseText || (t.subtitles?.join("; ") ?? ""),
          createdAt: t.time,
          meta: Object.keys(asstMeta).length ? asstMeta : undefined,
        });
      }
    }

    const first = cluster[0];
    return {
      source: "gemini" as const,
      // Deterministic per cluster-start so re-imports produce stable ids.
      nativeId: `session-${first.time}`,
      title: first.prompt.split("\n")[0].slice(0, 80),
      createdAt: first.time,
      updatedAt: cluster[cluster.length - 1].time,
      originalUrl: "https://gemini.google.com/app",
      messages: messages.filter((m) => m.text.trim().length > 0),
    };
  });
}
