# Recall — cross-AI chat history search

Local-first web app that searches your conversation history across Google Gemini,
Anthropic Claude, and OpenAI ChatGPT. Hybrid search: SQLite FTS5 (keyword/BM25) +
sqlite-vec (semantic, bge-small-en-v1.5 embedded locally via Transformers.js),
merged with reciprocal rank fusion. All data stays on this machine.

## Usage

```bash
npm run dev        # http://localhost:3000
npm run import     # (re)build the index from data/raw — idempotent per source
```

## Adding / refreshing data

Drop exports under `data/raw/` and run `npm run import`:

| Source  | Where to get it | Expected path |
|---|---|---|
| Gemini  | takeout.google.com → My Activity → Gemini Apps, **JSON format** | `data/raw/gemini/Takeout/My Activity/Gemini Apps/MyActivity.json` |
| Claude  | claude.ai → Settings → Privacy → Export data | `data/raw/claude/conversations.json` |
| ChatGPT | chatgpt.com → Settings → Data Controls → Export | `data/raw/chatgpt/conversations.json` |

Each import fully rebuilds that source's slice of the index (delete + reinsert),
so re-importing a newer export is always safe.

## Notes

- Gemini's export is a flat activity log with no conversation IDs; turns are
  grouped into conversations by 30-minute time-gap clustering (`src/lib/importers/gemini.ts`).
- ChatGPT's export is a message tree; the importer walks parent links from
  `current_node` to linearize the canonical branch.
- First import downloads the embedding model (~130 MB) into `.model-cache/`.
- `data/` is gitignored — it contains your personal conversation history.
