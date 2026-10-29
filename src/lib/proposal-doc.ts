import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";

// The proposal as a Word file, built from the editor's document (ProseMirror
// JSON): headings, paragraphs with bold/italic/links, bullet and numbered
// lists, tables and rules. Agencies often ask for Word or PDF; PDF comes
// from printing the page.

/** A ProseMirror node as the editor's getJSON() returns it. */
export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

/** "[Your UEI]"-style blanks left to fill, in order, without repeats. Links ([text](url)) and checkboxes don't count. */
export function findPlaceholders(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\[([^[\]\n]{2,120})\](?!\()/g)) {
    const inner = m[1]!.replace(/\\+$/, "").trim();
    if (/^[xX ]$/.test(inner) || /^\d+$/.test(inner)) continue;
    out.add(`[${inner}]`);
  }
  return [...out];
}

const FONT = "Calibri";
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

function runs(nodes: DocNode[] | undefined, base: { bold?: boolean } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out.push(new TextRun({ text: "", break: 1 }));
      continue;
    }
    if (n.type !== "text" || !n.text) continue;
    const has = (t: string) => n.marks?.some((m) => m.type === t) ?? false;
    // Line breaks inside a paragraph come through as "\n" in the text.
    const [first, ...more] = n.text.split("\n");
    if (more.length) {
      out.push(...runs([{ ...n, text: first }], base));
      for (const line of more) {
        out.push(new TextRun({ text: "", break: 1 }));
        if (line) out.push(...runs([{ ...n, text: line }], base));
      }
      continue;
    }
    const run = new TextRun({
      text: n.text,
      bold: base.bold || has("bold"),
      italics: has("italic"),
      strike: has("strike"),
      underline: has("underline") ? {} : undefined,
      font: has("code") ? "Consolas" : FONT,
      highlight: /\[[^\]]+\]/.test(n.text) ? "yellow" : undefined,
    });
    const link = n.marks?.find((m) => m.type === "link")?.attrs?.href;
    out.push(typeof link === "string" ? new ExternalHyperlink({ link, children: [new TextRun({ text: n.text, style: "Hyperlink", font: FONT })] }) : run);
  }
  return out;
}

const textOf = (n: DocNode): string => n.text ?? (n.content ?? []).map(textOf).join("");

function table(n: DocNode): Table {
  const rows = (n.content ?? []).filter((r) => r.type === "tableRow");
  const cols = Math.max(1, ...rows.map((r) => r.content?.length ?? 0));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (r) =>
        new TableRow({
          tableHeader: r.content?.every((c) => c.type === "tableHeader") ?? false,
          children: Array.from({ length: cols }, (_, i) => {
            const cell = r.content?.[i];
            const header = cell?.type === "tableHeader";
            const paras = (cell?.content ?? [{ type: "paragraph" }]).map((p) => new Paragraph({ children: runs(p.content, { bold: header }) }));
            return new TableCell({
              children: paras.length ? paras : [new Paragraph("")],
              shading: header ? { type: ShadingType.CLEAR, fill: "F2F2F2", color: "auto" } : undefined,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
            });
          }),
        }),
    ),
  });
}

/** Word paragraphs and tables for a list of block nodes. */
function blocks(nodes: DocNode[] | undefined, ctx: { level: number; list?: { ref: "bullets" | "numbers"; instance: number } }, counter: { n: number }): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const n of nodes ?? []) {
    switch (n.type) {
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 2)));
        out.push(new Paragraph({ heading: HEADINGS[level - 1], children: runs(n.content), spacing: { before: 240, after: 120 } }));
        break;
      }
      case "paragraph":
        out.push(
          new Paragraph({
            children: runs(n.content),
            spacing: { after: 120 },
            ...(ctx.list ? { numbering: { reference: ctx.list.ref, level: ctx.level, instance: ctx.list.instance } } : {}),
          }),
        );
        break;
      case "bulletList":
      case "orderedList": {
        const ref = n.type === "bulletList" ? "bullets" : "numbers";
        const instance = ++counter.n;
        for (const item of n.content ?? []) {
          const [first, ...rest] = item.content ?? [];
          if (first) out.push(...blocks([first], { level: ctx.list ? ctx.level + 1 : 0, list: { ref, instance } }, counter));
          if (rest.length) out.push(...blocks(rest, { level: ctx.list ? ctx.level + 1 : 0 }, counter));
        }
        break;
      }
      case "blockquote":
        for (const p of n.content ?? []) out.push(new Paragraph({ children: runs(p.content), indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 8, color: "BBBBBB", space: 8 } } }));
        break;
      case "codeBlock":
        out.push(new Paragraph({ children: [new TextRun({ text: textOf(n), font: "Consolas" })] }));
        break;
      case "horizontalRule":
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } }, spacing: { after: 120 } }));
        break;
      case "table":
        out.push(table(n), new Paragraph(""));
        break;
      default:
        if (n.content) out.push(...blocks(n.content, ctx, counter));
    }
  }
  return out;
}

export function proposalDocx(doc: DocNode, title: string): Document {
  const level = (i: number, format: (typeof LevelFormat)[keyof typeof LevelFormat], text: string) => ({
    level: i,
    format,
    text,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
  });
  return new Document({
    title,
    creator: "Kontract",
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering: {
      config: [
        { reference: "bullets", levels: [0, 1, 2, 3].map((i) => level(i, LevelFormat.BULLET, ["•", "◦", "▪", "•"][i]!)) },
        { reference: "numbers", levels: [0, 1, 2, 3].map((i) => level(i, [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN, LevelFormat.DECIMAL][i]!, `%${i + 1}.`)) },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children: blocks(doc.content, { level: 0 }, { n: 0 }) }],
  });
}
