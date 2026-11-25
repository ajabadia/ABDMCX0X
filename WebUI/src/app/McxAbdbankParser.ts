import { classifyBankCategory, getBankCategoryLabel } from '@abdsynths/shared/components/bank/bankCategories.js';
import type { McxCatalogItem } from '../ui/McxBankDrawer';

export interface McxWavePoolItem { index: number; id: string; name: string; rootKey: number; oneShot: boolean; }
export interface McxParsedBankResult {
  bankId: string; bankName: string; author?: string; description?: string; coverUrl?: string; items: McxCatalogItem[]; waves: McxWavePoolItem[];
}

const MAX_COVER_LEN = 600000;
const ZIP_COVER_NAMES = ['cover.webp', 'cover.png', 'cover.jpg', 'cover.jpeg', 'artwork.webp', 'artwork.png', 'thumb.webp', 'thumbnail.webp'];
const cleanName = (s: string): string => s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const imgExtOf = (n: string): string | undefined => n.toLowerCase().match(/\.(webp|png|jpe?g)$/)?.[1];

function bytesToImageDataUrl(bytes: Uint8Array, ext: string): string | undefined {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_LEN || typeof btoa !== 'function') return undefined;
  const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x4000) bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x4000, bytes.length)));
  return `data:${mime};base64,${btoa(bin)}`;
}

function resolveCover(raw: unknown, images: Map<string, string>): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_COVER_LEN) return undefined;
  if (/^data:image\/(webp|png|jpe?g);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) return trimmed;
  if (/^(?:\/banks\/|https:\/\/)[^\s"'<>]+\.(?:webp|png|jpe?g)(?:\?[^\s"'<>]*)?$/i.test(trimmed)) return trimmed;
  const norm = trimmed.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  return images.get(norm) || images.get(norm.split('/').pop() || '');
}

const pickObjCover = (obj: any, images: Map<string, string>): string | undefined => {
  for (const k of ['coverWebpDataUrl', 'coverDataUrl', 'coverUrl', 'thumbnailUri', 'coverImage']) {
    const found = resolveCover(obj?.[k], images);
    if (found) return found;
  }
  return undefined;
};

function extractEntriesFromAbdbank(arrayBuffer: ArrayBuffer): { manifest: any | null; images: Map<string, string> } {
  const u8 = new Uint8Array(arrayBuffer);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const dec = new TextDecoder();
  const images = new Map<string, string>();
  let manifest: any | null = null;
  let offset = 0;
  while (offset + 30 <= u8.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const dataOffset = offset + 30 + nameLen + extraLen;
    if (offset + 30 + nameLen > u8.length || dataOffset + compSize > u8.length) break;
    const name = dec.decode(u8.subarray(offset + 30, offset + 30 + nameLen)).replace(/\\/g, '/').replace(/^\.\//, '');
    const low = name.toLowerCase();
    if (method === 0 && (low === 'manifest.json' || low.endsWith('/manifest.json'))) {
      try { manifest = JSON.parse(dec.decode(u8.subarray(dataOffset, dataOffset + compSize))); }
      catch (err) { console.warn('[McxAbdbankParser] Failed to parse manifest JSON:', err); }
    } else if (method === 0 && compSize > 0 && compSize <= MAX_COVER_LEN) {
      const ext = imgExtOf(low);
      const url = ext ? bytesToImageDataUrl(u8.subarray(dataOffset, dataOffset + compSize), ext) : undefined;
      if (url) {
        images.set(low, url);
        const base = low.split('/').pop() || low;
        if (!images.has(base)) images.set(base, url);
      }
    }
    offset = dataOffset + compSize;
  }
  return { manifest, images };
}

/**
 * Parses an uncompressed ZIP (.abdbank / Store method) directly in JS
 * returning normalized bank metadata, McxCatalogItem entries, and wavePool descriptors.
 */
export function parseAbdbankArchive(
  arrayBuffer: ArrayBuffer,
  fileName = 'bank.abdbank',
  bankSlotIndex = 0,
  displayBankName?: string
): McxParsedBankResult {
  const stem = fileName.replace(/\.abdbank$/i, '');
  const { manifest, images } = extractEntriesFromAbdbank(arrayBuffer);
  if (!manifest) return { bankId: stem.toLowerCase(), bankName: cleanName(displayBankName || stem), items: [], waves: [] };

  const bankName = cleanName(String(displayBankName || manifest.bankName || stem));
  const bankId = String(manifest.bankId || manifest.bankName || stem).trim();
  const author = typeof manifest.author === 'string' && manifest.author.trim() ? manifest.author.trim() : undefined;
  const description = typeof manifest.description === 'string' && manifest.description.trim() ? manifest.description.trim() : undefined;
  const zipDefaultCover = ZIP_COVER_NAMES.map((n) => images.get(n)).find(Boolean);
  const bankCover = pickObjCover(manifest, images) || zipDefaultCover;
  const items: McxCatalogItem[] = [];

  items.push({
    id: `bank_${bankId}`, name: bankName, sublibrary: 'Banks', categoryName: getBankCategoryLabel(0),
    categoryId: 0, engineKind: 'structured_rompler', itemType: 3, bankId, bankSlotIndex,
    filePath: fileName, thumbnailUrl: bankCover,
  });

  if (Array.isArray(manifest.drumKits)) {
    manifest.drumKits.forEach((kit: any, kIdx: number) => {
      const kName = String(kit.name || `${bankName} Drum Kit`);
      const subBank = typeof kit.subBank === 'string' && kit.subBank.trim() ? kit.subBank.trim() : undefined;
      const inferred = classifyBankCategory(`${kit.category || ''} ${kName}`);
      const catId = typeof kit.categoryId === 'number' && kit.categoryId >= 0 && kit.categoryId <= 31
        ? kit.categoryId : (inferred.paramId === 9 ? 9 : 8);
      items.push({
        id: `bank_${bankId}_kit_${kit.id || kIdx}`, name: kName, sublibrary: bankName, subBank,
        categoryName: String(kit.category || getBankCategoryLabel(catId)), categoryId: catId,
        engineKind: 'rompler_drum_map', itemType: 1, bankId, bankSlotIndex, bankSlotKind: 'drum_kit',
        bankItemIndex: kIdx, thumbnailUrl: pickObjCover(kit, images) || bankCover,
      });
    });
  }

  if (Array.isArray(manifest.tones)) {
    manifest.tones.forEach((tone: any, tIdx: number) => {
      const tName = String(tone.name || `Tone ${tIdx + 1}`);
      const subBank = typeof tone.subBank === 'string' && tone.subBank.trim() ? tone.subBank.trim() : undefined;
      const inferred = classifyBankCategory(`${tone.category || ''} ${tName}`);
      const catId = typeof tone.categoryId === 'number' && tone.categoryId >= 0 && tone.categoryId <= 31
        ? tone.categoryId : inferred.paramId;
      items.push({
        id: `bank_${bankId}_tone_${tone.id || tIdx}`, name: tName, sublibrary: bankName, subBank,
        categoryName: String(tone.category || getBankCategoryLabel(catId)), categoryId: catId,
        engineKind: 'rompler_chromatic', itemType: 1, bankId, bankSlotIndex, bankSlotKind: 'tone',
        bankItemIndex: tIdx, thumbnailUrl: pickObjCover(tone, images) || bankCover,
      });
    });
  }

  const waves: McxWavePoolItem[] = Array.isArray(manifest.wavePool)
    ? manifest.wavePool.map((w: any, index: number) => ({
        index, id: String(w?.id || `w_${index}`), name: String(w?.name || w?.id || `Wave ${index + 1}`),
        rootKey: Number(w?.rootKey ?? 60), oneShot: (w?.playMode || 'oneshot') === 'oneshot',
      }))
    : [];

  return { bankId, bankName, author, description, coverUrl: bankCover, items, waves };
}

export function parseAbdbankCatalog(arrayBuffer: ArrayBuffer, fileName = 'bank.abdbank', bankSlotIndex = 0): McxCatalogItem[] {
  return parseAbdbankArchive(arrayBuffer, fileName, bankSlotIndex).items;
}
