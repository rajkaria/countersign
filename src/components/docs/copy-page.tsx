"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
export function CopyPage({ slug }: { slug: string }) {
  const [status, setStatus] = useState("Copy page");
  return (
    <>
      <button
        className="docs-copy"
        onClick={async () => {
          try {
            const response = await fetch(`/docs/raw/${slug}`);
            if (!response.ok) throw new Error("Unavailable");
            await navigator.clipboard.writeText(await response.text());
            setStatus("Copied");
          } catch {
            setStatus("Use Markdown link");
          }
        }}
      >
        {status === "Copied" ? <Check size={14} /> : <Copy size={14} />}{" "}
        {status}
      </button>
      <span className="sr-only" role="status">
        {status === "Copy page" ? "" : status}
      </span>
    </>
  );
}
