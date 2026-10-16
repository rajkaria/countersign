import type { ReactNode } from "react";
import { headings } from "@/lib/content/documents";
import { guides } from "@/lib/content/guides";
function inline(text: string): ReactNode[] {
  return text
    .split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g)
    .map((part, i) => {
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        let href = link[2];
        const local = guides.find((g) => g.file === href.replace(/^\.\//, ""));
        if (local) href = `/docs/${local.slug}`;
        return /^(https:\/\/|\/(?!\/)|#)/.test(href) ? (
          <a key={i} href={href}>
            {link[1]}
          </a>
        ) : (
          <span key={i}>{link[1]}</span>
        );
      }
      if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
      if (part.startsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      return part;
    });
}
export function Markdown({
  content,
  afterIntroduction,
}: {
  content: string;
  afterIntroduction?: ReactNode;
}) {
  const blocks: ReactNode[] = [];
  const lines = content.split("\n");
  const outline = headings(content);
  let headingIndex = 0;
  let introductionInserted = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code = [];
      const language = line.slice(3).trim();
      while (++i < lines.length && !lines[i].startsWith("```"))
        code.push(lines[i]);
      blocks.push(
        <div key={i} className="docs-code">
          {language && <span>{language}</span>}
          <pre
            tabIndex={0}
            role="region"
            aria-label={language ? `${language} code example` : "Code example"}
          >
            <code>{code.join("\n")}</code>
          </pre>
        </div>,
      );
      continue;
    }
    if (!line.trim()) continue;
    if (/^#{1,3} /.test(line)) {
      const h = outline[headingIndex++];
      const body = (
        <>
          {inline(h.title)}
          {h.level > 1 && (
            <a
              className="heading-anchor"
              href={`#${h.id}`}
              aria-label={`Link to ${h.title}`}
            >
              #
            </a>
          )}
        </>
      );
      blocks.push(
        h.level === 1 ? (
          <h1 id={h.id} key={i}>
            {body}
          </h1>
        ) : h.level === 2 ? (
          <h2 id={h.id} key={i}>
            {body}
          </h2>
        ) : (
          <h3 id={h.id} key={i}>
            {body}
          </h3>
        ),
      );
      continue;
    }
    if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d/.test(line);
      const pattern = ordered ? /^\d+\. / : /^- /;
      const list = [line.replace(pattern, "")];
      const start = ordered ? parseInt(line) : undefined;
      while (i + 1 < lines.length && pattern.test(lines[i + 1]))
        list.push(lines[++i].replace(pattern, ""));
      const items = list.map((item, j) => <li key={j}>{inline(item)}</li>);
      blocks.push(
        ordered ? (
          <ol key={i} start={start}>
            {items}
          </ol>
        ) : (
          <ul key={i}>{items}</ul>
        ),
      );
      continue;
    }
    if (line.startsWith("|")) {
      const rows = [line];
      while (i + 1 < lines.length && lines[i + 1].startsWith("|"))
        rows.push(lines[++i]);
      const cells = (row: string) =>
        row
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
      blocks.push(
        <div
          key={i}
          className="docs-table"
          tabIndex={0}
          role="region"
          aria-label="Reference table"
        >
          <table>
            <thead>
              <tr>
                {cells(rows[0]).map((c, j) => (
                  <th scope="col" key={j}>
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(2).map((row, j) => (
                <tr key={j}>
                  {cells(row).map((c, k) => (
                    <td key={k}>{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={i} />);
      continue;
    }
    const paragraph = [line];
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() &&
      !/^(#{1,3} |```|- |\d+\. |\||---)/.test(lines[i + 1])
    )
      paragraph.push(lines[++i]);
    blocks.push(<p key={i}>{inline(paragraph.join(" "))}</p>);
    if (afterIntroduction && !introductionInserted) {
      blocks.push(<div key="after-introduction">{afterIntroduction}</div>);
      introductionInserted = true;
    }
  }
  return blocks;
}
