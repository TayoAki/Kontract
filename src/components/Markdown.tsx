"use client";

import { Fragment, type ReactNode } from "react";

// A small Markdown renderer for drafts: headings, paragraphs, lists, tables,
// rules, bold/italic/code and http(s) links. It builds React elements (never
// raw HTML), so text echoed from a notice can't inject markup.

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**") || tok.startsWith("__")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[0.9em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const label = tok.slice(1, tok.indexOf("]("));
      out.push(
        <a key={key} href={m[2]} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
          {label}
        </a>,
      );
    } else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ source, className }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const key = () => `b${k++}`;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1]!.length;
      const cls =
        level === 1
          ? "text-xl font-semibold mt-1 mb-3"
          : level === 2
            ? "text-base font-semibold mt-6 mb-2 pb-1 border-b border-line"
            : "text-sm font-semibold mt-4 mb-1.5";
      const Tag = (`h${Math.min(level + 1, 6)}` as "h2");
      blocks.push(
        <Tag key={key()} className={cls}>
          {inline(h[2]!, `h${k}`)}
        </Tag>,
      );
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key()} className="my-4 border-line" />);
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "") && (lines[i + 1] ?? "").includes("-")) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      const numeric = head.map((_, c) => rows.length > 0 && rows.every((r) => !r[c] || /^[\s$*\d.,%()-]+$/.test(r[c]!)));
      blocks.push(
        <div key={key()} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            {head.some(Boolean) && (
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j} className={`border-b border-line-strong px-2 py-1.5 text-left font-semibold ${numeric[j] ? "text-right" : ""}`}>
                      {inline(c, `th${k}${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {head.map((_, j) => (
                    <td key={j} className={`border-b border-line px-2 py-1.5 align-top ${numeric[j] ? "text-right tabular-nums" : ""}`}>
                      {inline(r[j] ?? "", `td${k}${ri}${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key()} className={`my-2 space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `li${k}${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,4}\s|\s*([-*•]|\d+[.)])\s+|\s*\|.*\|\s*$|-{3,}\s*$)/.test(lines[i]!)) {
      para.push(lines[i]!);
      i++;
    }
    if (para.length === 0) {
      // Unrecognized line shape; render it as text so nothing is dropped.
      para.push(lines[i]!);
      i++;
    }
    blocks.push(
      <p key={key()} className="my-2 leading-relaxed">
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `p${k}${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className={className}>{blocks}</div>;
}
