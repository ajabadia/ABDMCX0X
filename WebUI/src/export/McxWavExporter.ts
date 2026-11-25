/**
 * ABDMCX0X -- McxWavExporter.ts
 * Stereo 16-bit PCM WAV encoder & dual-mode Native / Browser file download helper.
 * Strict line limit: < 120 lines.
 */

import type { McxHostBridge } from '../bridge/McxHostBridge';

function writeU16(view: DataView, offset: number, val: number): void { view.setUint16(offset, val, true); }
function writeU32(view: DataView, offset: number, val: number): void { view.setUint32(offset, val, true); }
function writeStr(bytes: Uint8Array, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) bytes[offset + i] = s.charCodeAt(i) & 0x7F;
}

export function encodeStereoWavPcm16(left: Float32Array, right: Float32Array, sampleRate = 44100): Uint8Array {
  const n = Math.max(0, Math.min(left.length, right?.length ?? left.length));
  const sr = Math.max(8000, Math.min(192000, Math.round(sampleRate || 44100)));
  const dataBytes = n * 4;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  writeStr(out, 0, 'RIFF'); writeU32(view, 4, 36 + dataBytes);
  writeStr(out, 8, 'WAVE'); writeStr(out, 12, 'fmt ');
  writeU32(view, 16, 16); writeU16(view, 20, 1); writeU16(view, 22, 2);
  writeU32(view, 24, sr); writeU32(view, 28, sr * 4);
  writeU16(view, 32, 4); writeU16(view, 34, 16);
  writeStr(out, 36, 'data'); writeU32(view, 40, dataBytes);

  let pos = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i] || 0));
    const r = Math.max(-1, Math.min(1, right ? right[i] : l));
    view.setInt16(pos, Math.round(l * 32767), true);
    view.setInt16(pos + 2, Math.round(r * 32767), true);
    pos += 4;
  }
  return out;
}

export function triggerBrowserDownload(bytes: Uint8Array, filename: string, mime = 'application/octet-stream'): void {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveOrDownloadExportFile(
  bridge: McxHostBridge,
  bytes: Uint8Array,
  kind: 'midi' | 'wav',
  extension: 'mid' | 'wav',
  filename: string,
): void {
  if (bridge.isNative) bridge.saveExportFileBase64(kind, extension, bytes);
  else triggerBrowserDownload(bytes, filename, extension === 'mid' ? 'audio/midi' : 'audio/wav');
}
