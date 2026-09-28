"use client";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
type Entry = {
  slug: string;
  title: string;
  description: string;
  content: string;
};
export function DocsSearch() {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const id = useId();
  async function load() {
    if (entries || pending.current) return;
    pending.current = true;
    setError(false);
    try {
      const response = await fetch("/docs/search.json");
      if (!response.ok) throw new Error("Search unavailable");
      setEntries(await response.json());
    } catch {
      setError(true);
    } finally {
      pending.current = false;
    }
  }
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results =
    terms.length && entries
      ? entries
          .map((entry) => ({
            ...entry,
            score: terms.reduce(
              (n, t) => n + (entry.title.toLowerCase().includes(t) ? 5 : 0),
              0,
            ),
          }))
          .filter((entry) =>
            terms.every((t) =>
              `${entry.title} ${entry.description} ${entry.content}`
                .toLowerCase()
                .includes(t),
            ),
          )
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
      : [];
  return (
    <div className="handbook-search">
      <label htmlFor={id} className="sr-only">
        Search documentation
      </label>
      <div className="handbook-search-input">
        <Search size={16} />
        <input
          id={id}
          value={query}
          placeholder="Search the handbook…"
          type="search"
          onFocus={load}
          onChange={(e) => {
            setQuery(e.target.value);
            void load();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          aria-controls={terms.length > 0 ? `${id}-results` : undefined}
          autoComplete="off"
        />
        {query && (
          <button aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={14} />
          </button>
        )}
      </div>
      {terms.length > 0 && (
        <div id={`${id}-results`} className="handbook-search-results">
          <p role="status">
            {error
              ? "Search could not load."
              : !entries
                ? "Loading guides…"
                : results.length
                  ? `${results.length} matching guides`
                  : "No matching guides. Try “acceptance” or “recovery”."}
          </p>
          {error && <button onClick={load}>Retry search</button>}
          {results.map((result) => (
            <Link
              href={`/docs/${result.slug}`}
              key={result.slug}
              onClick={() => setQuery("")}
            >
              <strong>{result.title}</strong>
              <span>{result.description}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
