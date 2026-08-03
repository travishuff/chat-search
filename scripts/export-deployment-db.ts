import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const source = process.env.CHAT_SEARCH_DB_PATH ?? path.join(process.cwd(), "data", "app.db");
  const destination = path.resolve(process.argv[2] ?? path.join(".deploy", "app.db"));

  if (!fs.existsSync(source)) {
    throw new Error(`No SQLite database found at ${source}. Run npm run import first.`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });

  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
  } finally {
    db.close();
  }

  const sizeMb = fs.statSync(destination).size / 1024 / 1024;
  console.log(`Deployment database exported to ${destination} (${sizeMb.toFixed(1)} MB)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
