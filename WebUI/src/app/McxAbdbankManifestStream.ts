/**
 * ABDMCX0X -- McxAbdbankManifestStream.ts
 * Fetches only the leading ZIP manifest.json slice of a .abdbank archive via Range + stream abort,
 * avoiding full multi-megabyte WAV downloads when building the sound catalog. Strictly < 200 lines.
 */

const DEFAULT_RANGE_BYTES = 2621439;
const MAX_STREAM_SCAN_BYTES = 4 * 1024 * 1024;

function readU16LE(u8: Uint8Array, off: number): number {
  return (u8[off] | (u8[off + 1] << 8)) >>> 0;
}

function readU32LE(u8: Uint8Array, off: number): number {
  return (u8[off] | (u8[off + 1] << 8) | (u8[off + 2] << 16) | (u8[off + 3] << 24)) >>> 0;
}

const isCoverEntry = (name: string): boolean => /(?:^|\/)(?:cover|thumb|thumbnail|artwork)\.(webp|png|jpe?g)$/i.test(name);

function hasCompleteManifestEntry(u8: Uint8Array, len: number, onDone = false): boolean {
  let off = 0;
  let manifestDone = false;
  const dec = new TextDecoder();
  while (off + 30 <= len) {
    if (readU32LE(u8, off) !== 0x04034b50) return manifestDone;
    const compSize = readU32LE(u8, off + 18);
    const nameLen = readU16LE(u8, off + 26);
    const extraLen = readU16LE(u8, off + 28);
    const dataEnd = off + 30 + nameLen + extraLen + compSize;
    if (off + 30 + nameLen > len) return manifestDone && onDone;
    const name = dec.decode(u8.subarray(off + 30, off + 30 + nameLen));
    const isManifest = name === 'manifest.json' || name.endsWith('/manifest.json');
    if (manifestDone && (!isCoverEntry(name) || compSize > 600000)) return true;
    if (dataEnd > len) return manifestDone && onDone;
    if (isManifest) manifestDone = true;
    off = dataEnd;
  }
  if (manifestDone && off + 4 <= len && readU32LE(u8, off) !== 0x04034b50) return true;
  return manifestDone && onDone;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}

export async function fetchAbdbankManifestSlice(url: string): Promise<ArrayBuffer | null> {
  if (typeof fetch !== 'function') return null;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${DEFAULT_RANGE_BYTES}` },
      signal: ctrl?.signal,
    });
    if (!res.ok) return null;
    if (!res.body || typeof res.body.getReader !== 'function') {
      return await res.arrayBuffer();
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_STREAM_SCAN_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      chunks.push(value);
      total += value.byteLength;
      if (total >= 30) {
        const merged = chunks.length === 1 ? chunks[0] : concatChunks(chunks, total);
        if (hasCompleteManifestEntry(merged, total)) {
          const out = merged.buffer.slice(merged.byteOffset, merged.byteOffset + total) as ArrayBuffer;
          try { void reader.cancel().catch(() => {}); } catch { /* ignore */ }
          try { ctrl?.abort(); } catch { /* ignore */ }
          return out;
        }
      }
    }
    const finalBytes = concatChunks(chunks, total);
    return hasCompleteManifestEntry(finalBytes, total, true) ? (finalBytes.buffer as ArrayBuffer) : null;
  } catch {
    return null;
  }
}
