import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCorpus, docRank, orderDocs, quoteFound, verifyReading } from "./bid-reading.ts";

test("documents are read amendments and the statement of work first, specs late, wage tables never", () => {
  const names = ["Specifications REV2.pdf", "DBA General Decision CA20260018.docx", "S02 - RFQ No. 36C26127Q0082.docx", "Statement of Work.docx", "Amendment 0001.docx", "Notice"];
  assert.deepEqual(orderDocs(names.map((name) => ({ name }))).map((d) => d.name), ["Notice", "Amendment 0001.docx", "Statement of Work.docx", "S02 - RFQ No. 36C26127Q0082.docx", "Specifications REV2.pdf", "DBA General Decision CA20260018.docx"]);
  const corpus = buildCorpus(names.map((name) => ({ name, text: `${name} body text` })));
  assert.ok(!corpus.text.includes("General Decision"), "wage determinations stay out");
  assert.equal(docRank("Attachment C - Price Breakdown.xlsx"), 4);
});

test("long documents are cut to the part that describes the work, within the budget", () => {
  const clauses = Array.from({ length: 400 }, (_, i) => `52.212-${i} Clause text that goes on and on about terms. (End of Clause)`).join("\n");
  const work = "Remove and replace approximately 12,000 SF of built-up roofing at Building 347.";
  const { text, docs } = buildCorpus([{ name: "RFQ.docx", text: `${"Intro. ".repeat(100)}\n${clauses}\n${work}` }], 12_000);
  assert.ok(text.length < 13_000);
  assert.ok(text.includes(work), "the work paragraph survives");
  assert.equal(docs[0]!.name, "RFQ.docx");
});

test("scope items Claude can't quote from the documents are dropped", () => {
  const docs = [{ name: "SOW.docx", text: "The contractor shall remove and replace approximately 12,000 SF of built-up roofing, including flashing." }];
  assert.equal(quoteFound("remove and replace approximately 12,000 SF", docs), true);
  assert.equal(quoteFound("Remove  and REPLACE approximately 12,000 sf!", docs, "SOW.docx"), true, "spacing and case don't matter");
  assert.equal(quoteFound("install 40 skylights", docs), false);
  const r = verifyReading(
    {
      summary: " Replace a roof. ",
      scope: [
        { description: "Replace built-up roofing", quantity: 12000, unit: "square foot", quote: "remove and replace approximately 12,000 SF of built-up roofing", doc: "SOW.docx" },
        { description: "Install skylights", quantity: 40, unit: "each", quote: "install 40 skylights over the atrium", doc: "SOW.docx" },
        { description: "Replace built-up roofing", quantity: 1, unit: null, quote: "remove and replace approximately 12,000 SF", doc: "SOW.docx" },
        { description: "Flashing", quantity: -3, unit: " ", quote: "including flashing", doc: "SOW.docx" },
      ],
      trades: ["Roofing", "Roofing", " "],
      questions: [],
      risks: ["Bonding"],
    },
    docs,
  );
  assert.deepEqual(r.scope.map((s) => s.description), ["Replace built-up roofing", "Flashing"], "invented and duplicate items go");
  assert.deepEqual([r.scope[1]!.quantity, r.scope[1]!.unit], [null, null], "a negative quantity and a blank unit are cleared");
  assert.equal(quoteFound("roofing", docs), false, "a quote under 8 characters doesn't count");
  assert.equal(r.summary, "Replace a roof.");
  assert.deepEqual(r.trades, ["Roofing"]);
});
