/**
 * ABDMCX0X -- McxTrackCoverPopup.ts
 * Multi-engine track cover resolution and Track CoverPopup adapter over @abdsynths/shared.
 * Strictly < 200 lines. Zero hardcoded colors.
 */

import { attachCoverPopup, closeAllCoverPopups, hideCoverHoverPopover, openCoverModal, type CoverPopupData } from '@abdsynths/shared/components';
import { getBankCategoryLabel } from '@abdsynths/shared/components/bank/bankCategories.js';
import { getCategoryIconSvg } from '@abdsynths/shared/components/bank/bankIcons.js';
import { getEngineMetadata } from '@abdsynths/shared/components/synth-engines';
import { soundBankRegistry, type McxSoundBankEntry } from '../app/McxSoundBankManager';
import type { McxEngineDescriptorDto } from '../bridge/McxHostBridge';
import { DEFAULT_ENGINE_CATALOG } from './McxEngineCatalogDefaults';
import type { McxPartUiState } from './McxPartState';

export interface TrackCoverResolution {
  engineTypeId: string;
  engDesc?: McxEngineDescriptorDto;
  engMeta: ReturnType<typeof getEngineMetadata>;
  bankEntry?: McxSoundBankEntry;
  bankCover?: string;
  coverUrl?: string;
  bankLabel: string;
}

export interface TrackCoverPopupContext {
  partId: number;
  slotLabel: string;
  ps: McxPartUiState;
  catId: number;
  soundName: string;
  routeTag: string;
  midiFullLabel: string;
  resolved: TrackCoverResolution;
}

const fmtBytes = (n?: number): string =>
  !n || n <= 0 ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function closeTrackCoverPopups(): void {
  closeAllCoverPopups();
}

export function hideTrackCoverHoverPopover(): void {
  hideCoverHoverPopover();
}

export function resolveTrackCoverAndEngine(ps: McxPartUiState, catalog?: McxEngineDescriptorDto[]): TrackCoverResolution {
  const isExt = (ps.routeMode ?? 0) === 1;
  const engIdx = isExt ? 1 : (ps.engineTypeIndex ?? 0);
  const list = catalog && catalog.length ? catalog : DEFAULT_ENGINE_CATALOG;
  const explicitByType =
    ps.engineTypeId && !(ps.engineTypeId === 'structured_rompler' && engIdx > 0)
      ? list.find((e) => e.typeId === ps.engineTypeId)
      : undefined;
  const engDesc = explicitByType ?? list.find((e) => e.index === engIdx);
  const engineTypeId = isExt ? 'external_midi' : (engDesc?.typeId || ps.engineTypeId || 'structured_rompler');
  const engMeta = getEngineMetadata(engineTypeId);
  const isRompler = engineTypeId === 'structured_rompler';
  const bankEntry = !isExt && isRompler && ps.soundBankId ? soundBankRegistry.getBankById(ps.soundBankId) : undefined;
  const bankCover = !isExt ? (isRompler ? (ps.coverUrl || bankEntry?.coverUrl) : ps.coverUrl) : undefined;
  const coverUrl = bankCover || engMeta.defaultImage || undefined;
  const bankLabel = isExt
    ? 'MIDI Hardware'
    : ((isRompler ? (ps.soundBankName || bankEntry?.name) : undefined) || engMeta.shortBadge || 'Factory');
  return { engineTypeId, engDesc, engMeta, bankEntry, bankCover, coverUrl, bankLabel };
}

function buildTrackCoverPopupData(ctx: TrackCoverPopupContext): CoverPopupData {
  const { ps, resolved, catId, slotLabel, soundName, routeTag, midiFullLabel } = ctx;
  const { engMeta, bankEntry, bankCover, coverUrl, bankLabel } = resolved;
  const isDrum = ps.kind === 'drum_map';
  const modeLabel = isDrum ? 'DRUM KIT' : 'CROMÁTICO';
  const catLabel = getBankCategoryLabel(catId, 'es', 'musical');
  const instCount = bankEntry?.items?.filter((it) => it.itemType === 1).length ?? 0;
  const waveCount = bankEntry?.waves?.length ?? 0;
  const sizeStr = fmtBytes(bankEntry?.sizeBytes);
  const pan = ps.partPan ?? 0;
  const panStr = Math.abs(pan) < 0.03 ? 'C' : pan < 0 ? `L${Math.round(-pan * 50)}` : `R${Math.round(pan * 50)}`;
  const lvlStr = `${Math.round((ps.partLevel ?? 0.85) * 100)}%`;
  const seqNotes = ps.sequence?.notes?.length ?? 0;

  return {
    title: soundName,
    modalTitle: `${slotLabel} · ${soundName}`,
    subtitle: `${bankLabel} · ${engMeta.displayName}`,
    badge: `${engMeta.shortBadge} · ${modeLabel}`,
    category: `${catLabel}${bankEntry?.author ? ` · ${bankEntry.author}` : ''}`,
    description: engMeta.description || '',
    extraDescription: bankEntry?.description || '',
    coverUrl,
    fallbackSvg: engMeta.iconSvg || getCategoryIconSvg(catId),
    hoverSize: 120,
    modalSize: 220,
    secondaryCard:
      bankCover && engMeta.defaultImage
        ? {
            title: engMeta.displayName,
            subtitle: engMeta.description || engMeta.category,
            coverUrl: engMeta.defaultImage,
            fallbackSvg: engMeta.iconSvg || getCategoryIconSvg(catId),
          }
        : undefined,
    pills: [
      `${slotLabel} · P${String(ctx.partId + 1).padStart(2, '0')}`,
      routeTag,
      midiFullLabel,
      `Vol ${lvlStr}`,
      `Pan ${panStr}`,
      ...(seqNotes > 0 ? [`SEQ ${seqNotes}`] : []),
      ...(ps.arpEnabled ? ['ARP'] : []),
      ...(instCount > 0 ? [`${instCount} instr.`] : []),
      ...(sizeStr ? [sizeStr] : []),
    ],
    metaRows: [
      ['Motor', `${engMeta.displayName} (${engMeta.shortBadge})`],
      ['Pista / Modo', `${slotLabel} · P${String(ctx.partId + 1).padStart(2, '0')} · ${modeLabel}`],
      ['Banco', bankLabel],
      ['Categoría', catLabel],
      ['Ruta MIDI', `${routeTag} · ${midiFullLabel}`],
      [
        'Mezcla',
        `Vol ${lvlStr} · Pan ${panStr} · Rev ${Math.round((ps.reverbSend ?? 0) * 100)}% · Cho ${Math.round((ps.chorusSend ?? 0) * 100)}%`,
      ],
      ...(bankEntry?.author ? [['Autor', bankEntry.author] as [string, string]] : []),
      ...(instCount > 0
        ? [['Instr. banco', `${instCount}${waveCount > 0 ? ` · ${waveCount} PCM` : ''}`] as [string, string]]
        : []),
      ...(sizeStr ? [['Tamaño', sizeStr] as [string, string]] : []),
      ...(ps.sequence || ps.arpEnabled
        ? [['Patrón', `${seqNotes} notas · ${ps.arpEnabled ? `ARP (${ps.arpRate || '1/16'})` : 'ARP off'}`] as [string, string]]
        : []),
    ],
    popoverClass: 'mcx-track-cover-popover',
    backdropClass: 'mcx-track-cover-backdrop',
    modalClass: 'mcx-track-cover-modal',
    closeAct: 'close-tcp',
    closeLabel: 'Cerrar',
  };
}

export function openTrackCoverModal(ctx: TrackCoverPopupContext): void {
  openCoverModal(buildTrackCoverPopupData(ctx));
}

export function wireTrackCoverPopup(coverEl: HTMLElement | null, ctx: TrackCoverPopupContext): void {
  attachCoverPopup(coverEl, () => buildTrackCoverPopupData(ctx), { stopPropagation: true });
}
