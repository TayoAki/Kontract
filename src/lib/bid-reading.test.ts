import assert from "node:assert/strict";
import { test } from "node:test";
import { bidText, buildCorpus, docRank, locateQuote, orderDocs, quoteFound, verifyReading } from "./bid-reading.ts";

test("documents are read amendments and the statement of work first, specs late, wage tables never", () => {
  const names = ["Specifications REV2.pdf", "DBA General Decision CA20260018.docx", "S02 - RFQ No. 36C26127Q0082.docx", "Statement of Work.docx", "Amendment 0001.docx", "Notice"];
  assert.deepEqual(orderDocs(names.map((name) => ({ name }))).map((d) => d.name), ["Notice", "Amendment 0001.docx", "Statement of Work.docx", "S02 - RFQ No. 36C26127Q0082.docx", "Specifications REV2.pdf", "DBA General Decision CA20260018.docx"]);
  const corpus = buildCorpus(names.map((name) => ({ name, text: `${name} body text` })));
  assert.ok(!corpus.text.includes("General Decision"), "wage determinations stay out");
  assert.equal(docRank("Attachment C - Price Breakdown.xlsx"), 4);
  // Names written with underscores rank the same as with spaces.
  assert.equal(docRank("A04_Statement_of_Work_Caliente_Janitorial.pdf"), 2);
  assert.equal(docRank("A06_Bid_Schedule_L3926Q0031.xlsx"), 4);
  assert.equal(docRank("Sol_140L3926Q0031.pdf"), 3);
  assert.equal(docRank("B03_Wage_Determination_2015-5599_Rv_32.pdf"), 8);
  assert.equal(docRank("Sol_140R4026Q0141_Amd_0004.pdf"), 1);
  assert.equal(docRank("Attachment_3_-_DBA_WD_CO20260001.pdf"), 8);
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

test("a bid page's own documents, not the portal's guides; page text without the clutter", async () => {
  const { documentLinks, cleanPageMarkdown } = await import("./bid-reading.ts");
  assert.deepEqual(
    documentLinks(
      ["https://bidcondocs.delaware.gov/DSU/DSU26-PC24-013_itb.pdf", "/DSU/DSU26-PC24-013_specs.pdf", "https://a856-cityrecord.nyc.gov/Content/CityRecordOnlineUserGuide.pdf", "https://www1.nyc.gov/assets/dcas/downloads/pdf/cityrecord/cityrecord-10-28-26.pdf", "https://x.gov/Bids/Details/9374", "mailto:a@b.gov", "https://bidcondocs.delaware.gov/DSU/DSU26-PC24-013_itb.pdf"],
      "https://bidcondocs.delaware.gov/Bids/Details/9374",
    ),
    [
      { url: "https://bidcondocs.delaware.gov/DSU/DSU26-PC24-013_itb.pdf", name: "DSU26-PC24-013 itb.pdf" },
      { url: "https://bidcondocs.delaware.gov/DSU/DSU26-PC24-013_specs.pdf", name: "DSU26-PC24-013 specs.pdf" },
    ],
  );
  assert.equal(cleanPageMarkdown("![logo](x.png)\nSelect LanguageAbkhaz…\n# Design Build\n\n\n\nEmail [timothy@hacla.org](mailto:timothy@hacla.org)"), "# Design Build\n\nEmail timothy@hacla.org");
});

const pdf = (pages: string[]) => pages.map((t, i) => `[Page ${i + 1}]\n${t}`).join("\n\n");

test("the combined text says where each document starts, keeps the order and leaves wage tables out", () => {
  const docs = [
    { id: "a2", name: "Specifications.pdf", text: "Spec text here." },
    { id: "a1", name: "Statement of Work.pdf", text: pdf(["Contractor shall clean all restrooms daily.", "Floors are waxed monthly."]) },
    { id: "a3", name: "Wage Determination.pdf", text: "Janitor $18.20" },
    { id: "notice", name: "Notice", text: 'Janitorial services at the "Main" clinic.' },
  ];
  const { text, parts } = bidText(docs);
  assert.deepEqual(parts.map((p) => p.doc.id), ["notice", "a1", "a2"]);
  for (const p of parts) assert.ok(text.startsWith(`<document name="${p.doc.name.replace(/"/g, "'")}">\n`, p.startsAt), p.doc.name);
  assert.ok(text.includes("[Page 2]\nFloors are waxed monthly."));
  assert.ok(!text.includes("Janitor $18.20"));
  assert.equal(parts[1]!.chars, docs[1]!.text.length);
  assert.ok(parts.every((p) => !p.excerpted));
});

test("an excerpted PDF keeps the page line ahead of each paragraph it keeps", () => {
  const filler = "Clause text that is not about the work at all, repeated for length. ".repeat(40);
  const pages = Array.from({ length: 40 }, (_, i) => (i === 30 ? "The contractor shall remove and replace 2,400 square feet of carpet in the lobby." : filler));
  const { text, parts } = bidText([{ id: "a1", name: "SOW.pdf", text: pdf(pages) }], 20_000);
  assert.ok(parts[0]!.excerpted);
  assert.match(text, /\[Page 31\]\nThe contractor shall remove and replace 2,400 square feet/);
  // The corpus sent to Claude is unchanged: no page lines in the excerpted part.
  const corpus = buildCorpus([{ name: "SOW.pdf", text: pdf(pages) }], 20_000).text;
  assert.ok(!/\[Page 31\]/.test(corpus));
});

test("a quote is found in the named document, or in another when it was named wrong, with its page", () => {
  const docs = [
    { name: "Notice", text: "Janitorial services for the clinic." },
    { name: "A04_Statement_of_Work.pdf", text: pdf(["Intro page.", "Scope.\nContractor shall   clean ALL restrooms daily, including\n", "fixtures and floors."]) },
  ];
  assert.deepEqual(locateQuote("contractor shall clean all restrooms daily", docs, "A04_Statement_of_Work.pdf"), { found: true, doc: "A04_Statement_of_Work.pdf", page: 2 });
  assert.deepEqual(locateQuote("Contractor shall clean all restrooms daily", docs, "Notice"), { found: true, doc: "A04_Statement_of_Work.pdf", page: 2 });
  // Across a page break, with or without the page line in the quote.
  assert.equal(locateQuote("restrooms daily, including fixtures and floors", docs).page, 2);
  assert.equal(locateQuote("restrooms daily, including [Page 3] fixtures and floors", docs).found, true);
  assert.deepEqual(locateQuote("Janitorial services", docs), { found: true, doc: "Notice", page: null });
  assert.deepEqual(locateQuote("Contractor shall paint the lobby", docs), { found: false, doc: null, page: null });
  assert.equal(locateQuote("daily", docs).found, false, "under 8 characters never counts");
});
