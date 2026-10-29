import assert from "node:assert/strict";
import { test } from "node:test";
import { Packer } from "docx";
import { unzipSync } from "fflate";
import { findPlaceholders, proposalDocx, type DocNode } from "./proposal-doc.ts";

test("findPlaceholders lists the blanks, not links or checkboxes", () => {
  assert.deepEqual(findPlaceholders("UEI: [Your UEI]\nCAGE: [CAGE code] and again [Your UEI]. See [SAM.gov](https://sam.gov). - [x] done - [ ] todo. Footnote [1]."), ["[Your UEI]", "[CAGE code]"]);
  assert.deepEqual(findPlaceholders("No blanks here."), []);
  assert.deepEqual(findPlaceholders("By: [company name\\]"), ["[company name]"], "an escaped bracket from the editor still counts once");
});

const doc: DocNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Proposal: Replace Roof" }] },
    { type: "paragraph", content: [{ type: "text", text: "We will " }, { type: "text", text: "complete", marks: [{ type: "bold" }] }, { type: "text", text: " the work. UEI [Your UEI]." }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Tear-off" }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Haul away" }] }] }] }] }] },
    { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Mobilize" }] }] }] },
    {
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Price" }] }] }] },
        { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Roofing" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "$1,450,000" }] }] }] },
      ],
    },
    { type: "paragraph", content: [{ type: "text", text: "Submitted by: Prime Co\nDate: Oct 29, 2026" }] },
    { type: "horizontalRule" },
    { type: "paragraph", content: [{ type: "text", text: "sam.gov", marks: [{ type: "link", attrs: { href: "https://sam.gov" } }] }] },
  ],
};

test("the proposal becomes a real Word file with headings, lists, a table and highlighted blanks", async () => {
  const buf = await Packer.toBuffer(proposalDocx(doc, "Proposal"));
  const files = unzipSync(new Uint8Array(buf));
  const xml = new TextDecoder().decode(files["word/document.xml"]!);
  for (const text of ["Proposal: Replace Roof", "complete", "Tear-off", "Haul away", "Mobilize", "Roofing", "$1,450,000", "[Your UEI]"]) assert.ok(xml.includes(text), `missing ${text}`);
  assert.match(xml, /<w:pStyle w:val="Heading2"\/>/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /<w:numPr>/, "list items are numbered paragraphs");
  assert.match(xml, /<w:highlight w:val="yellow"\/>/, "blanks are highlighted");
  assert.match(xml, /<w:hyperlink/);
  assert.match(xml, /Prime Co<\/w:t><\/w:r><w:r>(?:<w:rPr>.*?<\/w:rPr>)?<w:br\/>/, "a line break inside a paragraph stays a line break");
  assert.ok(files["word/numbering.xml"], "list numbering is defined");
});
