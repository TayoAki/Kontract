import assert from "node:assert/strict";
import { test } from "node:test";
import { CsvParser, MixedDecoder } from "./csv.ts";

function parseAll(chunks: string[]): string[][] {
  const p = new CsvParser();
  const rows = chunks.flatMap((c) => p.push(c));
  return [...rows, ...p.end()];
}

test("quoted fields, escaped quotes, commas and newlines inside quotes", () => {
  const csv = '"a","b,c","say ""hi""","line1\nline2"\n1,2,3,4\n';
  assert.deepEqual(parseAll([csv]), [
    ["a", "b,c", 'say "hi"', "line1\nline2"],
    ["1", "2", "3", "4"],
  ]);
});

test("CRLF rows, empty fields and no trailing newline", () => {
  assert.deepEqual(parseAll(['x,,"",y\r\nlast,row']), [
    ["x", "", "", "y"],
    ["last", "row"],
  ]);
});

test("same result however the input is chunked", () => {
  const csv = '"NoticeId","Title"\n"abc","Paint ""Bldg 4"", CRLF\r\ninside"\r\n"def",plain\n';
  const whole = parseAll([csv]);
  for (let size = 1; size <= 7; size++) {
    const chunks: string[] = [];
    for (let i = 0; i < csv.length; i += size) chunks.push(csv.slice(i, i + size));
    assert.deepEqual(parseAll(chunks), whole, `chunk size ${size}`);
  }
  assert.deepEqual(whole[1], ["abc", 'Paint "Bldg 4", CRLF\r\ninside']);
});

test("decoder reads Windows-1252 and embedded UTF-8", () => {
  const d = new MixedDecoder();
  // Officer’s – “quote” (cp1252), café (cp1252 é), then UTF-8 ’ and non-breaking space
  const bytes = Uint8Array.from([
    0x4f, 0x92, 0x73, 0x20, 0x96, 0x20, 0x93, 0x71, 0x94, 0x20, 0x63, 0x61, 0x66, 0xe9, 0x20, 0xe2, 0x80, 0x99, 0xc2, 0xa0, 0x21,
  ]);
  assert.equal(d.decode(bytes, true), "O’s – “q” café ’ !");
});

test("decoder keeps a UTF-8 sequence split across chunks", () => {
  const d = new MixedDecoder();
  const a = d.decode(Uint8Array.from([0x41, 0xe2, 0x80]));
  const b = d.decode(Uint8Array.from([0x99, 0x42]), true);
  assert.equal(a + b, "A’B");
});

test("decoder falls back to Windows-1252 for an unfinished sequence at the end", () => {
  const d = new MixedDecoder();
  assert.equal(d.decode(Uint8Array.from([0x41, 0xe2]), true), "Aâ");
});
