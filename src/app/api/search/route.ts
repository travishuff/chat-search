import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/search";

const MAX_QUERY_LENGTH = 500;

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) return NextResponse.json({ results: [] });
    if (q.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: "query too long" }, { status: 400 });
    }
    const sources = req.nextUrl.searchParams.get("sources")?.split(",").filter(Boolean);
    const results = await search(q, { sources: sources?.length ? sources : undefined });
    return NextResponse.json({ results });
  } catch (e) {
    console.error("search failed:", e);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
