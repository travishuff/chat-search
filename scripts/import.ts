import fs from "fs";
import path from "path";
import { getDb } from "../src/lib/db";
import { ingest } from "../src/lib/ingest";
import { parseClaude } from "../src/lib/importers/claude";
import { parseGemini } from "../src/lib/importers/gemini";
import { parseChatGPT } from "../src/lib/importers/chatgpt";

const RAW = path.join(process.cwd(), "data", "raw");

const SOURCES = [
  {
    source: "gemini",
    file: path.join(RAW, "gemini", "Takeout", "My Activity", "Gemini Apps", "MyActivity.json"),
    parse: parseGemini,
  },
  {
    source: "claude",
    file: path.join(RAW, "claude", "conversations.json"),
    parse: parseClaude,
  },
  {
    source: "chatgpt",
    file: path.join(RAW, "chatgpt", "conversations.json"),
    parse: parseChatGPT,
  },
];

async function main() {
  const only = process.argv[2]; // optional: import a single source
  const db = getDb();
  for (const { source, file, parse } of SOURCES) {
    if (only && source !== only) continue;
    if (!fs.existsSync(file)) {
      console.log(`[${source}] no export found at ${file} — skipping`);
      continue;
    }
    console.log(`[${source}] parsing ${file}`);
    const conversations = parse(file);
    const msgCount = conversations.reduce((n, c) => n + c.messages.length, 0);
    console.log(`[${source}] ${conversations.length} conversations, ${msgCount} messages`);
    const { chunks } = await ingest(db, source, conversations, (done, total) => {
      if (done % 160 === 0 || done === total) console.log(`[${source}] embedded ${done}/${total} chunks`);
    });
    console.log(`[${source}] done — ${chunks} chunks indexed`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
