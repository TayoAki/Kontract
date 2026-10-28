import { unzipSync } from "fflate";

// Plain text out of the files agencies attach to notices: Word, Excel and
// PowerPoint (zipped XML, read without running anything in them), PDF (via
// unpdf), and text/HTML. Old binary .doc/.xls files are skipped.

export interface DocText {
  kind: "docx" | "xlsx" | "pptx" | "pdf" | "text";
  text: string;
  pages?: number;
  /** A PDF with almost no text layer: a scan that would need OCR. */
  scanned?: boolean;
}

export class DocTextError extends Error {}

/** Per-entry and total limits on what we decompress, so a zip bomb can't exhaust memory. */
const MAX_ENTRY = 40 * 1024 * 1024;
const MAX_TOTAL = 80 * 1024 * 1024;
const MAX_PDF_PAGES = 600;

export function extOf(name: string): string {
  return name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1] ?? "";
}

/** Whether we can read a file of this name at all. */
export function readable(name: string): boolean {
  return ["docx", "xlsx", "xlsm", "pptx", "pdf", "txt", "htm", "html", "csv"].includes(extOf(name));
}

export function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tidy(s: string): string {
  return s
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function unzip(bytes: Uint8Array, want: (name: string) => boolean): Record<string, string> {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (!want(f.name)) return false;
        if (f.originalSize > MAX_ENTRY) return false;
        total += f.originalSize;
        if (total > MAX_TOTAL) throw new DocTextError("The file is too large to read.");
        return true;
      },
    });
  } catch (err) {
    if (err instanceof DocTextError) throw err;
    throw new DocTextError("The file is damaged or isn't a real Office document.");
  }
  const dec = new TextDecoder();
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, dec.decode(v)]));
}

/** Word: paragraphs, table cells as "a | b", and checkboxes as ☒/☐ (they mark which option applies). */
export function docxXmlText(xml: string): string {
  return tidy(
    decodeXml(
      xml
        // Field codes (TOC entries, page numbers) and deleted tracked changes aren't the document's text.
        .replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, "")
        .replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "")
        // Inside a table cell, paragraphs run together so a row stays on one line.
        .replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (cell) => cell.replace(/<\/w:p>/g, " "))
        .replace(/<w14:checked w14:val="(?:1|true)"\s*\/>/g, "☒ ")
        .replace(/<w14:checked w14:val="(?:0|false)"\s*\/>/g, "☐ ")
        .replace(/<w:checked(?:\s+w:val="(?:1|true)")?\s*\/>/g, "☒ ")
        .replace(/<w:sym [^>]*w:char="F0(?:FE|FD|78)"[^>]*\/>/gi, "☒ ")
        .replace(/<w:sym [^>]*w:char="F0(?:A8|6F|71)"[^>]*\/>/gi, "☐ ")
        .replace(/<w:tab[^>]*\/>/g, "\t")
        .replace(/<w:br[^>]*\/>/g, "\n")
        .replace(/<\/w:tc>/g, " | ")
        .replace(/<\/w:tr>/g, "\n")
        .replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, ""),
    ).replace(/\s*\|\s*$/gm, ""),
  );
}

function docx(bytes: Uint8Array): DocText {
  const files = unzip(bytes, (n) => n === "word/document.xml" || /^word\/(footnotes|endnotes)\.xml$/.test(n));
  if (!files["word/document.xml"]) throw new DocTextError("No document body in this Word file.");
  const parts = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"].filter((k) => files[k]).map((k) => docxXmlText(files[k]!));
  return { kind: "docx", text: parts.join("\n\n") };
}

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

/** Excel: each row as "a | b | c", one sheet after another under its name. */
export function xlsxText(files: Record<string, string>): string {
  const shared = [...(files["xl/sharedStrings.xml"] ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decodeXml([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const names = [...(files["xl/workbook.xml"] ?? "").matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => decodeXml(m[1]!));
  const sheets = Object.keys(files)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  const out: string[] = [];
  sheets.forEach((k, i) => {
    const rows: string[] = [];
    for (const row of files[k]!.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of row[1]!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]!;
        const body = c[2] ?? "";
        const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
        const type = attrs.match(/t="(\w+)"/)?.[1];
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = "";
        if (type === "s" && v != null) value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = decodeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
        else if (v != null) value = decodeXml(v);
        value = value.replace(/\s+/g, " ").trim();
        if (!value) continue;
        cells[ref ? colIndex(ref) : cells.length] = value;
      }
      const line = cells.filter((x) => x).join(" | ");
      if (line) rows.push(line);
    }
    if (rows.length) out.push(`${names[i] ? `## ${names[i]}\n` : ""}${rows.join("\n")}`);
  });
  return tidy(out.join("\n\n"));
}

function xlsx(bytes: Uint8Array): DocText {
  const files = unzip(bytes, (n) => n === "xl/sharedStrings.xml" || n === "xl/workbook.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  return { kind: "xlsx", text: xlsxText(files) };
}

function pptx(bytes: Uint8Array): DocText {
  const files = unzip(bytes, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const slides = Object.keys(files)
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]))
    .map((k) => decodeXml(files[k]!.replace(/<\/a:p>/g, "\n").replace(/<a:br\/>/g, "\n").replace(/<[^>]+>/g, "")));
  return { kind: "pptx", text: tidy(slides.join("\n\n")), pages: slides.length };
}

async function pdf(bytes: Uint8Array): Promise<DocText> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  let doc: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    doc = await getDocumentProxy(bytes);
  } catch {
    throw new DocTextError("The PDF is damaged or password-protected.");
  }
  const pages = doc.numPages;
  const { text } = await extractText(doc, { mergePages: false });
  const kept = (text as string[]).slice(0, MAX_PDF_PAGES);
  const joined = tidy(kept.map((t, i) => `[Page ${i + 1}]\n${t}`).join("\n\n"));
  const chars = kept.reduce((n, t) => n + t.replace(/\s/g, "").length, 0);
  return { kind: "pdf", text: joined, pages, scanned: chars / Math.max(1, kept.length) < 40 };
}

/** Text from one attached file. Throws DocTextError when it can't be read. */
export async function docText(name: string, bytes: Uint8Array): Promise<DocText> {
  const ext = extOf(name);
  if (ext === "docx") return docx(bytes);
  if (ext === "xlsx" || ext === "xlsm") return xlsx(bytes);
  if (ext === "pptx") return pptx(bytes);
  if (ext === "pdf") return pdf(bytes);
  if (ext === "txt" || ext === "csv") return { kind: "text", text: tidy(new TextDecoder().decode(bytes)) };
  if (ext === "htm" || ext === "html") {
    const html = new TextDecoder().decode(bytes);
    return { kind: "text", text: tidy(decodeXml(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " "))) };
  }
  throw new DocTextError(ext === "doc" || ext === "xls" || ext === "ppt" ? "Old Office format; open it on SAM.gov." : "Not a document we can read.");
}
