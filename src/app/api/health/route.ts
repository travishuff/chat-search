import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const row = getDb().prepare("SELECT COUNT(*) AS conversations FROM conversations").get() as {
      conversations: number;
    };
    return NextResponse.json({ status: "ok", conversations: row.conversations });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
