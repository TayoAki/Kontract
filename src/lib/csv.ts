// Streaming CSV parsing and text decoding for SAM.gov's daily extract.
// The extract is mostly Windows-1252, with some UTF-8 pasted into
// descriptions, so bytes are decoded as UTF-8 where they form a valid
// sequence and as Windows-1252 everywhere else.

// Windows-1252 code points for bytes 0x80–0x9F (latin1 covers the rest).
const CP1252: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž",
  0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
  0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

/** Length of a valid UTF-8 sequence at `i`; 0 if invalid; -1 if it may continue past the end. */
function utf8Length(buf: Uint8Array, i: number): number {
  const b0 = buf[i]!;
  const need = b0 >= 0xc2 && b0 <= 0xdf ? 2 : b0 >= 0xe0 && b0 <= 0xef ? 3 : b0 >= 0xf0 && b0 <= 0xf4 ? 4 : 0;
  if (need === 0) return 0;
  for (let k = 1; k < need; k++) {
    if (i + k >= buf.length) return -1;
    const b = buf[i + k]!;
    if ((b & 0xc0) !== 0x80) return 0;
    if (k === 1 && ((b0 === 0xe0 && b < 0xa0) || (b0 === 0xed && b > 0x9f) || (b0 === 0xf0 && b < 0x90) || (b0 === 0xf4 && b > 0x8f))) return 0;
  }
  return need;
}

const slice = (buf: Uint8Array, start: number, end: number, enc: "latin1" | "utf8") =>
  Buffer.from(buf.buffer, buf.byteOffset + start, end - start).toString(enc);

export class MixedDecoder {
  private carry: Uint8Array | null = null;

  decode(chunk: Uint8Array, final = false): string {
    let buf = chunk;
    if (this.carry) {
      buf = new Uint8Array(this.carry.length + chunk.length);
      buf.set(this.carry);
      buf.set(chunk, this.carry.length);
      this.carry = null;
    }
    const parts: string[] = [];
    const n = buf.length;
    let plain = 0;
    let i = 0;
    while (i < n) {
      const b = buf[i]!;
      if (b < 0x80) {
        i++;
        continue;
      }
      if (i > plain) parts.push(slice(buf, plain, i, "latin1"));
      const len = utf8Length(buf, i);
      if (len > 0) {
        parts.push(slice(buf, i, i + len, "utf8"));
        i += len;
      } else if (len < 0 && !final) {
        this.carry = buf.slice(i);
        plain = n;
        break;
      } else {
        parts.push(CP1252[b] ?? String.fromCharCode(b));
        i++;
      }
      plain = i;
    }
    if (plain < n) parts.push(slice(buf, plain, n, "latin1"));
    return parts.join("");
  }
}

/**
 * Incremental RFC 4180 parser: quoted fields, doubled quotes, commas and
 * newlines inside quotes, LF or CRLF row endings. Feed text with `push`,
 * collect completed rows, then call `end`.
 */
export class CsvParser {
  private field = "";
  private row: string[] = [];
  private inQuotes = false;
  /** Saw a quote inside a quoted field; the next character decides if it was escaped. */
  private quotePending = false;

  push(text: string): string[][] {
    const rows: string[][] = [];
    const n = text.length;
    let i = 0;
    while (i < n) {
      if (this.quotePending) {
        this.quotePending = false;
        if (text[i] === '"') {
          this.field += '"';
          i++;
          continue;
        }
        this.inQuotes = false;
      }
      if (this.inQuotes) {
        const q = text.indexOf('"', i);
        if (q < 0) {
          this.field += text.slice(i);
          break;
        }
        this.field += text.slice(i, q);
        this.quotePending = true;
        i = q + 1;
        continue;
      }
      const c = text[i]!;
      if (c === '"' && this.field === "") {
        this.inQuotes = true;
        i++;
      } else if (c === ",") {
        this.row.push(this.field);
        this.field = "";
        i++;
      } else if (c === "\n") {
        this.row.push(this.field);
        this.field = "";
        rows.push(this.row);
        this.row = [];
        i++;
      } else if (c === "\r") {
        i++;
      } else {
        let j = i + 1;
        while (j < n) {
          const d = text[j];
          if (d === "," || d === "\n" || d === "\r" || d === '"') break;
          j++;
        }
        // A stray quote in an unquoted field is kept as text.
        if (j < n && text[j] === '"') j++;
        this.field += text.slice(i, j);
        i = j;
      }
    }
    return rows;
  }

  end(): string[][] {
    if (this.quotePending) this.quotePending = false;
    this.inQuotes = false;
    if (this.field !== "" || this.row.length > 0) {
      this.row.push(this.field);
      const last = this.row;
      this.field = "";
      this.row = [];
      return [last];
    }
    return [];
  }
}
