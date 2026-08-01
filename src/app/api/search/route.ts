import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/search";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });
  const sources = req.nextUrl.searchParams.get("sources")?.split(",").filter(Boolean);
  const results = await search(q, { sources: sources?.length ? sources : undefined });
  return NextResponse.json({ results });
}
