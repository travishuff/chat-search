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

## Testing

```bash
npm test                   # unit and integration tests
npm run test:coverage      # coverage report
npx playwright install chromium  # first browser-test run only
npm run test:e2e           # end-to-end test against a local test database
npm run typecheck
npm run build
```

## Deployment

The app can be deployed as a private server-side Next.js application through
Hostinger's managed Node.js GitHub integration. Hostinger connects to the
dedicated `hostinger-production` branch, and `npm run deploy:hostinger` is the
explicit release trigger; normal pushes to `main` do not deploy. Because the
archive contains private conversations and depends on a persistent SQLite file,
follow the authentication, storage, environment-variable, and database-upload
steps in [the Hostinger deployment guide](docs/hostinger-deployment.md). Never
commit the database or raw exports to GitHub.

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

Local development does not require authentication. Production fails closed
unless `RECALL_AUTH_USERNAME` and `RECALL_AUTH_PASSWORD` are configured. The
resulting HTTP Basic Authentication must only be used over HTTPS. Anyone with
those credentials can read the entire archive, so use a long unique password
and do not share or commit it.
