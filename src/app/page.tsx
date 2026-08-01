import { getDb } from "@/lib/db";
import SearchApp from "./search-app";

export const dynamic = "force-dynamic";

export default function Home() {
  const db = getDb();
  const counts = db
    .prepare("SELECT source, COUNT(*) n FROM conversations GROUP BY source ORDER BY source")
    .all() as { source: string; n: number }[];
  const range = db
    .prepare("SELECT MIN(created_at) lo, MAX(updated_at) hi FROM conversations")
    .get() as { lo: number | null; hi: number | null };

  return <SearchApp counts={counts} range={range} />;
}
