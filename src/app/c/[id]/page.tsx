import { getDb } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import ScrollToTarget from "./scroll-to-target";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = { gemini: "Gemini", claude: "Claude", chatgpt: "ChatGPT" };

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { id } = await params;
  const { m: targetMessageId } = await searchParams;
  const db = getDb();

  const convo = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(decodeURIComponent(id)) as any;
  if (!convo) notFound();

  const messages = db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY position")
    .all(convo.id) as any[];

  const fmt = (ms: number | null) =>
    ms
      ? new Date(ms).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";

  return (
    <main className="container">
      <ScrollToTarget targetId={targetMessageId} />
      <header className="convo-head">
        <Link href="/" className="back mono">
          ← back to search
        </Link>
        <h1>{convo.title}</h1>
        <p className="mono">
          <span className={`src ${convo.source}`}>{LABELS[convo.source] ?? convo.source}</span>{" "}
          · {fmt(convo.created_at)} · {messages.length} messages
          {convo.original_url && (
            <>
              {" · "}
              <a className="outlink" href={convo.original_url} target="_blank" rel="noreferrer">
                open in {LABELS[convo.source]} ↗
              </a>
            </>
          )}
        </p>
      </header>

      {messages.map((msg) => (
        <article
          key={msg.id}
          id={`msg-${msg.id}`}
          className={`msg ${msg.role} ${msg.id === targetMessageId ? "target" : ""}`}
        >
          <div className="who mono">
            {msg.role === "user" ? "you" : LABELS[convo.source] ?? convo.source}
            {msg.model ? ` · ${msg.model}` : ""}
          </div>
          <div className="body">{msg.text}</div>
        </article>
      ))}
    </main>
  );
}
