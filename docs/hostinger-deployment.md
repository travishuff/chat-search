# Deploying Recall to Hostinger from GitHub

This guide targets Hostinger's managed **Node.js Web App** deployment on a
Business Web Hosting or Cloud plan. Recall must run as a server-side Next.js
application; it cannot be exported as a static site.

## Before you connect GitHub

1. Keep the repository private. Never commit `data/`, `.deploy/`, `.env` files,
   or `.model-cache/`; they contain private conversation data or credentials.
2. Import and verify the latest exports locally:

   ```bash
   npm run import
   npm test
   npm run build
   npm audit --omit=dev
   ```

   Review audit findings before deploying. Do not apply breaking automated
   fixes blindly; update affected dependencies when their supported releases
   contain the fixes.

3. Create a consistent database backup for upload:

   ```bash
   npm run export:deployment-db
   ```

   The resulting `.deploy/app.db` is ignored by Git. Do not add it to the
   repository.

## Create private persistent storage

GitHub deployments are installed under Hostinger's managed `nodejs` deployment
directory, which can be replaced during a redeploy. The SQLite database and
embedding-model cache must live outside that directory and outside
`public_html`.

Before exposing the site, use hPanel's File Manager to create a private,
writable directory that your hosting plan confirms persists across Node.js
redeployments. A typical layout is:

```text
/home/HOSTINGER_USER/domains/YOUR_DOMAIN/private/recall/
├── app.db
└── model-cache/
```

Upload `.deploy/app.db` as `app.db`. Do not place it in `public_html`, where it
could be downloaded. If the managed plan cannot provide a writable directory
outside the deployment and public web roots, stop here and use a Hostinger VPS
or migrate the search store to a managed database. SQLite must not be placed on
an ephemeral deployment filesystem.

## Create the deployment branch

Hostinger redeploys whenever its connected branch changes, so do not connect it
to `main`. After these changes have been reviewed, merged, and pushed, prepare
the dedicated deployment branch from a clean, current `main`:

```bash
git switch main
git pull --ff-only
npm run deploy:hostinger
```

The command refuses to proceed unless local `main` exactly matches
`origin/main`. It then runs type checks, unit and integration tests, a production
build, and browser tests before pushing the verified commit to the
`hostinger-production` branch.

## Connect the GitHub repository

1. In hPanel, open **Websites → Add Website → Deploy Web App**.
2. Choose **Import Git Repository**, authorize the Hostinger GitHub App, and
   grant it access to this repository.
3. Select the repository and the `hostinger-production` branch. Connecting it
   triggers the initial deployment.
4. Confirm these settings if Hostinger does not detect them automatically:

   | Setting | Value |
   |---|---|
   | Framework | Next.js |
   | Project/root directory | `.` |
   | Node.js | 24.x |
   | Install command | `npm ci` |
   | Build command | `npm run build` |
   | Start command | `npm run start` |
   | Output directory | `.next` |
   | Port | `3000` |

Normal pushes and merges to `main` do not deploy. Keep pull requests and the
included GitHub Actions checks as the gate before merging to `main`, and do not
push directly to `hostinger-production`.

## Deploy a release from the terminal

After merging a release to `main`, run:

```bash
git switch main
git pull --ff-only
npm run deploy:hostinger
```

That command is the deployment trigger: it validates the exact GitHub `main`
commit and then advances `hostinger-production`. Hostinger sees the connected
branch change and deploys it. To run the same validations without releasing,
use `npm run deploy:hostinger -- --check`.

## Configure environment variables

Add these in the Hostinger deployment settings. Replace every placeholder and
use a long, unique password.

```dotenv
RECALL_AUTH_USERNAME=your-private-username
RECALL_AUTH_PASSWORD=replace-with-a-long-random-password
CHAT_SEARCH_DB_PATH=/home/HOSTINGER_USER/domains/YOUR_DOMAIN/private/recall/app.db
CHAT_SEARCH_MODEL_CACHE_DIR=/home/HOSTINGER_USER/domains/YOUR_DOMAIN/private/recall/model-cache
```

Do not commit the real values. Production deliberately returns an error when
authentication or the database path is missing. Basic authentication is safe
only over Hostinger's HTTPS endpoint; do not bypass HTTPS.

## First deployment and verification

1. Deploy after the private database has been uploaded and the environment
   variables have been saved. If connecting the deployment branch triggered
   the first build before this setup was complete, upload the database, then
   run the terminal deployment command again after the next `main` commit or
   use **Settings & Redeploy** for that one-time setup correction.
2. Open the site and sign in through the browser's authentication prompt.
3. Verify that the archive counts and a known search result are present.
4. Check the authenticated health endpoint:

   ```bash
   curl --user 'YOUR_USERNAME:YOUR_PASSWORD' https://YOUR_DOMAIN/api/health
   ```

   A ready archive returns `{"status":"ok","conversations":N}` with `N`
   greater than zero.
5. Run a semantic search. The first one downloads the embedding model into the
   configured persistent cache and can take longer than later searches.

## Updating conversation data

Managed Business and Cloud Node.js deployments do not provide the same shell
workflow as a VPS. Rebuild the index locally, export a fresh backup, upload it
to a temporary filename, replace `app.db` through File Manager, and restart the
Node.js application. Keep the previous database as a rollback copy until the
new archive is verified.

Do not overwrite an open SQLite database in place. Replace it while the app is
being redeployed/restarted, and keep the database, `-wal`, and `-shm` files in
the same private directory if Hostinger creates them.

## Operational constraints

- This SQLite architecture is suitable for one Node.js application instance.
  Do not scale it to multiple writers or multiple hosts sharing the same file.
- Back up the private database independently of GitHub.
- If native packages (`better-sqlite3`, `sqlite-vec`, or the Transformers
  runtime) cannot load on the managed plan, use a Hostinger VPS, which provides
  control over the operating system and native runtime.
- Keep Hostinger's GitHub App limited to this repository unless broader access
  is intentional.

## Hostinger references

- [Deploy a Node.js web app from GitHub](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Select the Node.js runtime version](https://www.hostinger.com/support/how-to-select-the-node-js-version-for-your-application/)
- [Configure deployment environment variables](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)
- [Use Hostinger File Manager](https://www.hostinger.com/support/4548688-basic-actions-in-the-file-manager-in-hostinger/)
- [Troubleshoot Node.js deployment logs](https://www.hostinger.com/support/how-to-troubleshoot-a-failed-node-js-deployment-using-build-logs/)
