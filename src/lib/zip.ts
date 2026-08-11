/**
 * Minimal ZIP writer (store method, no compression).
 *
 * Receipt images are already JPEG/PNG-compressed, so deflating them buys almost
 * nothing — storing avoids pulling in a compression dependency for a feature
 * that runs a few times a year.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const textBytes = (s: string): Uint8Array => new TextEncoder().encode(s);

/** DOS date/time as used in ZIP headers (2-second resolution, 1980 epoch). */
function dosDateTime(d: Date): { time: number; date: number } {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

/** Builds a ZIP archive. Entry names may contain "/" to create folders. */
export function createZip(entries: ZipEntry[], when = new Date()): Blob {
  const { time, date } = dosDateTime(when);
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = textBytes(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);   // local file header
    lv.setUint16(4, 20, true);           // version needed
    lv.setUint16(6, 0x0800, true);       // UTF-8 filename flag
    lv.setUint16(8, 0, true);            // method: store
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);        // compressed size
    lv.setUint32(22, size, true);        // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);           // extra length
    local.set(nameBytes, 30);

    chunks.push(local, entry.data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);   // central directory header
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);      // offset of local header
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + size;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);     // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  // Uint8Array is a valid BlobPart at runtime; the cast avoids copying every
  // receipt's bytes purely to satisfy TS's ArrayBufferLike narrowing.
  const parts = [...chunks, ...central, end] as unknown as BlobPart[];
  return new Blob(parts, { type: "application/zip" });
}

/**
 * Strips path separators and unsafe characters so an entry can't escape its
 * folder. Traversal segments are removed before separators are rewritten —
 * doing it the other way round leaves fragments like "-..-etc" behind.
 */
export function safeName(s: string, fallback = "file"): string {
  const cleaned = (s ?? "")
    .replace(/\.{2,}/g, "")            // kill traversal segments first
    .replace(/[/\\]+/g, "-")           // then flatten separators
    .replace(/[^\w.\-() ]+/g, "_")     // and anything else unusual
    .replace(/-{2,}/g, "-")            // collapse runs
    .replace(/^[-._\s]+|[-._\s]+$/g, "") // trim leading/trailing punctuation
    .slice(0, 80)
    .trim();
  return cleaned || fallback;
}
