# Recall — cross-AI chat history search

Local-first web app that searches your conversation history across Google Gemini,
Anthropic Claude, and OpenAI ChatGPT. Hybrid search: SQLite FTS5 (keyword/BM25) +
sqlite-vec (semantic, bge-small-en-v1.5 embedded locally via Transformers.js),
merged with reciprocal rank fusion. All data stays on this machine.

## Usage

```bash
npm run dev                # http://localhost:3000
npm run import             # (re)build the index from data/raw — idempotent per source
npm run import chatgpt     # rebuild a single source
```

## Adding / refreshing data

Drop exports under `data/raw/` and run `npm run import`:

| Source  | Where to get it | Expected path |
|---|---|---|
| Gemini  | takeout.google.com → My Activity → Gemini Apps, **JSON format** | `data/raw/gemini/Takeout/My Activity/Gemini Apps/MyActivity.json` |
| Claude  | claude.ai → Settings → Privacy → Export data | `data/raw/claude/conversations.json` |
| ChatGPT | chatgpt.com → Settings → Data Controls → Export | `data/raw/chatgpt/` — the extracted export root, containing `conversations-000.json`, `-001.json`, … (older exports with a single `conversations.json` also work) |

Each import fully rebuilds that source's slice of the index (delete + reinsert),
so re-importing a newer export is always safe.

## Notes

- Gemini's export is a flat activity log with no conversation IDs; turns are
  grouped into conversations by 30-minute time-gap clustering (`src/lib/importers/gemini.ts`).
- ChatGPT's export is a message tree; the importer walks parent links from
  `current_node` to linearize the canonical branch. Reasoning traces
  (`thoughts` / `reasoning_recap` blocks) are not indexed, matching how
  Claude's thinking blocks are handled.
- First import downloads the embedding model (~130 MB) into `.model-cache/`.
- `data/` is gitignored — it contains your personal conversation history.

## Security

There is **no authentication**. The app is meant to run on `localhost` only —
anyone who can reach the server can read your entire AI conversation history.
Do not bind it to other interfaces (`next dev -H 0.0.0.0`) or run `next start`
on a shared network without putting auth in front of it.
