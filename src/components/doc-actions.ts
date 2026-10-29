"use client";

import type { Editor } from "@tiptap/react";

// What you can do with a document from the editor: print it (or save as
// PDF), download it as Word, or copy it so it pastes formatted into an email.

const PRINT_CSS = `
  body { font: 13.5px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 24px; margin: 0 0 12px; } h2 { font-size: 20px; margin: 20px 0 10px; } h3 { font-size: 16px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ddd; } h4 { font-size: 14px; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; } th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; } td p, th p { margin: 0; } ul, ol { padding-left: 20px; } li { margin: 3px 0; } li p { margin: 0; } hr { border: 0; border-top: 1px solid #ddd; }
  @page { margin: 18mm; }
`;

/** Print in its own window, so the app layout doesn't clip it. */
export function printHtml(html: string, title: string): boolean {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title></title><style>${PRINT_CSS}</style></head><body>${html}</body></html>`);
  w.document.title = title;
  w.document.close();
  w.focus();
  w.print();
  return true;
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Download the editor's document as a .docx. */
export async function downloadWord(editor: Editor, fileName: string, title: string): Promise<void> {
  const [{ Packer }, { proposalDocx }] = await Promise.all([import("docx"), import("@/lib/proposal-doc")]);
  const blob = await Packer.toBlob(proposalDocx(editor.getJSON(), title));
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName.endsWith(".docx") ? fileName : `${fileName}.docx` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Plain text of the document: headings, paragraphs and list items on their own lines. */
export function plainText(editor: Editor): string {
  return editor.getText({ blockSeparator: "\n\n" }).replace(/\n{3,}/g, "\n\n").trim();
}

/** Copy with formatting (it pastes into Gmail or Outlook with headings and lists), falling back to plain text. */
export async function copyDoc(editor: Editor): Promise<boolean> {
  const html = editor.getHTML();
  const text = plainText(editor);
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}
