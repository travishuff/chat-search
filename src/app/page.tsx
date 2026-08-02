import { getDb } from "@/lib/db";
import SearchApp from "./search-app";

export const dynamic = "force-dynamic";

const SEARCH_SOURCES = new Set(["gemini", "claude", "chatgpt"]);

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sources?: string }>;
}) {
  const { q = "", sources = "" } = await searchParams;
  const db = getDb();
  const counts = db
    .prepare("SELECT source, COUNT(*) n FROM conversations GROUP BY source ORDER BY source")
    .all() as { source: string; n: number }[];
  const range = db
    .prepare("SELECT MIN(created_at) lo, MAX(updated_at) hi FROM conversations")
    .get() as { lo: number | null; hi: number | null };

  const initialSources = sources.split(",").filter((source) => SEARCH_SOURCES.has(source));

  return <SearchApp counts={counts} range={range} initialQuery={q} initialSources={initialSources} />;
}
