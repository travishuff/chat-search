"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Result {
  conversationId: string;
  source: string;
  title: string;
  conversationDate: number | null;
  messageId: string;
  role: string;
  snippet: string;
}

const SOURCES = ["gemini", "claude", "chatgpt"] as const;
const LABELS: Record<string, string> = { gemini: "Gemini", claude: "Claude", chatgpt: "ChatGPT" };

export default function SearchApp({
  counts,
  range,
  initialQuery = "",
  initialSources = [],
}: {
  counts: { source: string; n: number }[];
  range: { lo: number | null; hi: number | null };
  initialQuery?: string;
  initialSources?: string[];
}) {
  const [q, setQ] = useState(initialQuery);
  const [active, setActive] = useState<string[]>(initialSources);
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const countBySource = useMemo(() => Object.fromEntries(counts.map((c) => [c.source, c.n])), [counts]);
  const total = counts.reduce((n, c) => n + c.n, 0);

  useEffect(() => {
    const url = new URL(window.location.href);
    const query = q.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (active.length) url.searchParams.set("sources", active.join(","));
    else url.searchParams.delete("sources");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [q, active]);

  useEffect(() => {
    abortRef.current?.abort();
    const query = q.trim();
    if (!query) {
      abortRef.current = null;
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let ctrl: AbortController | null = null;
    const t = setTimeout(async () => {
      ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const params = new URLSearchParams({ q: query });
        if (active.length) params.set("sources", active.join(","));
        const res = await fetch(`/api/search?${params}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`search failed with status ${res.status}`);
        const data = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setResults([]);
      } finally {
        if (abortRef.current === ctrl) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl?.abort();
    };
  }, [q, active]);

  const toggle = (s: string) =>
    setActive((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const clearSearch = () => {
    setQ("");
    setActive([]);
    inputRef.current?.focus();
  };

  const resultHref = (result: Result) => {
    const params = new URLSearchParams({ m: result.messageId });
    const query = q.trim();
    if (query) params.set("q", query);
    if (active.length) params.set("sources", active.join(","));
    return `/c/${encodeURIComponent(result.conversationId)}?${params}`;
  };

  const fmtDate = (ms: number | null) =>
    ms ? new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";

  const years =
    range.lo && range.hi
      ? `${new Date(range.lo).getFullYear()}–${new Date(range.hi).getFullYear()}`
      : "";

  return (
    <main className="container">
      <header className="masthead">
        <h1>Recall - across AI chatbots</h1>
        <p className="sub">
          Everything you have asked your machines, {years}.{" "}
          <span className="counts mono">
            {total.toLocaleString()} conversations ·{" "}
            {counts.map((c) => `${LABELS[c.source] ?? c.source} ${c.n}`).join(" · ")}
          </span>
        </p>
      </header>

      <div className="searchbar">
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="that conversation where I asked about…"
        />
        {(q || active.length > 0) && (
          <button type="button" className="clear-search mono" onClick={clearSearch}>
            clear
          </button>
        )}
      </div>

      <div className="filters">
        {SOURCES.map((s) => (
          <button
            key={s}
            className={`chip mono ${s} ${active.includes(s) ? "active" : ""}`}
            disabled={!countBySource[s]}
            onClick={() => toggle(s)}
          >
            {LABELS[s]}
            {countBySource[s] ? "" : " — none yet"}
          </button>
        ))}
      </div>

      {results !== null && results.length === 0 && !loading && (
        <p className="status">Nothing surfaced. Try different words — the semantic index is forgiving.</p>
      )}

      {results?.map((r) => (
        <a
          key={r.messageId}
          className="result"
          href={resultHref(r)}
        >
          <div className="meta mono">
            <span className={`src ${r.source}`}>{LABELS[r.source] ?? r.source}</span>
            <span>{fmtDate(r.conversationDate)}</span>
            <span>{r.role === "user" ? "you" : "reply"}</span>
          </div>
          <h3>{r.title}</h3>
          <p className="snippet">
            <Highlighted text={r.snippet} query={q} />
          </p>
        </a>
      ))}

      {results === null && (
        <p className="status">
          Type to search {total.toLocaleString()} conversations by keyword and by meaning.
        </p>
      )}
    </main>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.join("|")})`, "gi");
  // split with a capture group puts matches at odd indices
  const parts = text.split(re);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p))}</>;
}
