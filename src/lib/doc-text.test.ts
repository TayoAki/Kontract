import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { docText, DocTextError, docxXmlText, readable } from "./doc-text.ts";

const docxBody = (inner: string) =>
  `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${inner}</w:body></w:document>`;

test("Word text keeps paragraphs, table cells and which box is checked", async () => {
  const xml = docxBody(
    '<w:p><w:r><w:t>Magnitude:</w:t></w:r></w:p>' +
      '<w:p><w:r><w:sym w:font="Wingdings" w:char="F0A8"/><w:t xml:space="preserve"> Less than $25,000</w:t></w:r></w:p>' +
      '<w:p><w:r><w:sym w:font="Wingdings" w:char="F0FE"/><w:t xml:space="preserve"> Between $1,000,000 and $5,000,000</w:t></w:r></w:p>' +
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Roof</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12,000 SF</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
      "<w:p><w:r><w:t>AT&amp;T &lt;ok&gt;</w:t></w:r></w:p>",
  );
  const text = docxXmlText(xml);
  assert.match(text, /☐ Less than \$25,000/);
  assert.match(text, /☒ Between \$1,000,000 and \$5,000,000/);
  assert.match(text, /Roof \| 12,000 SF/);
  assert.match(text, /AT&T <ok>/);

  const file = zipSync({ "word/document.xml": strToU8(xml), "word/styles.xml": strToU8("<x/>") });
  const doc = await docText("RFQ.docx", file);
  assert.equal(doc.kind, "docx");
  assert.match(doc.text, /Between \$1,000,000/);
});

test("Excel rows come out as cells joined by |, with shared strings resolved", async () => {
  const file = zipSync({
    "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Price Breakdown" r:id="1"/></sheets></workbook>'),
    "xl/sharedStrings.xml": strToU8("<sst><si><t>Division 07 - Roofing</t></si><si><r><t>Lab</t></r><r><t>or</t></r></si></sst>"),
    "xl/worksheets/sheet1.xml": strToU8(
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>Bonding</t></is></c><c r="B2"><v>1500</v></c></row><row r="3"><c r="A3"/></row></sheetData></worksheet>',
    ),
  });
  const doc = await docText("Attachment C - Price Breakdown.xlsx", file);
  assert.equal(doc.text, "## Price Breakdown\nDivision 07 - Roofing | Labor\nBonding | 1500");
});

test("PowerPoint slides, plain text, and what we refuse", async () => {
  const file = zipSync({ "ppt/slides/slide2.xml": strToU8("<p><a:p><a:t>Second</a:t></a:p></p>"), "ppt/slides/slide1.xml": strToU8("<p><a:p><a:t>Site visit 9am</a:t></a:p></p>") });
  const doc = await docText("Briefing.pptx", file);
  assert.equal(doc.text, "Site visit 9am\n\nSecond");
  assert.equal(doc.pages, 2);
  assert.equal((await docText("notes.txt", strToU8("  hello \n\n\n\nworld "))).text, "hello\n\nworld");
  await assert.rejects(docText("old.doc", new Uint8Array([1, 2])), DocTextError);
  await assert.rejects(docText("broken.docx", strToU8("not a zip")), DocTextError);
  assert.equal(readable("Drawings.dwg"), false);
  assert.equal(readable("SOW.PDF"), true);
});
