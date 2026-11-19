/**
 * ABDMCX0X -- BridgeWasmTypes.ts
 * Shared DTOs & zero-duplication payload parsers for telemetry, multi-engine, and Song/Scenes.
 */

export interface McxTelemetry {
  peakL: number;
  peakR: number;
  activeVoices: number;
  samplesL?: Float32Array;
  peakSendA?: number;
  peakSendB?: number;
  peakSendC?: number;
  peakSendD?: number;
  limiterGrDb?: number;
  sendBusMutes?: boolean[];
  sendLabels?: { sendA: string; sendB: string; sendC: string; sendD: string };
  partPeaks?: number[];
  partMidiPeaks?: number[];
  lfoPhase?: number;
  seqPlaying?: boolean;
  seqTick?: number;
  seqStep?: number;
  seqTotalTicks?: number;
  bpm?: number;
  activeScene?: number;
  queuedScene?: number;
  songMode?: boolean;
  songLoop?: boolean;
  songBlockIdx?: number;
  songBarInBlock?: number;
  songBlockCount?: number;
  sceneApplySeq?: number;
  appliedMuteMask?: number;
  appliedTranspose?: number;
  rackPeakIn?: number[];
  rackPeakOut?: number[];
  rackClipIn?: boolean[];
  rackClipOut?: boolean[];
}

export interface McxEngineDescriptorDto {
  index: number;
  typeId: string;
  displayName: string;
  supportsDrumMode: boolean;
  supportsChromaticMode?: boolean;
  supportsBankArchives: boolean;
  maxRecommendedInstances: number;
}

export interface McxPartPresetsDto {
  part: number;
  engineTypeIndex: number;
  engineTypeId: string;
  currentPreset: string;
  presets: Array<{ index: number; name: string }>;
}

export interface McxPartEngineStateDto {
  part: number;
  engineTypeId: string;
  presetName: string;
  stateJson: string;
  coverDataUrl?: string;
}

export interface McxSceneSlotDto {
  index: number;
  name: string;
  muteMask: number;
  transpose: number;
}

export interface McxSongBlockDto {
  sceneIndex: number;
  bars: number;
  transposeOffset: number;
}

export interface McxSongScenesStateDto {
  songMode: boolean;
  songLoop: boolean;
  activeScene: number;
  queuedScene: number;
  songBlockIdx: number;
  songBarInBlock: number;
  scenes: McxSceneSlotDto[];
  blocks: McxSongBlockDto[];
}

export function parseTelemetryPayload(raw: any): McxTelemetry {
  const samples = raw.samplesL instanceof Float32Array
    ? raw.samplesL
    : (Array.isArray(raw.samplesL) ? Float32Array.from(raw.samplesL) : undefined);
  return {
    peakL: Number(raw.peakL ?? 0), peakR: Number(raw.peakR ?? 0), activeVoices: Number(raw.activeVoices ?? 0),
    samplesL: samples,
    peakSendA: Number(raw.peakSendA ?? 0), peakSendB: Number(raw.peakSendB ?? 0),
    peakSendC: Number(raw.peakSendC ?? 0), peakSendD: Number(raw.peakSendD ?? 0),
    limiterGrDb: Number(raw.limiterGrDb ?? 0),
    sendBusMutes: Array.isArray(raw.sendBusMutes) ? raw.sendBusMutes.map(Boolean) : undefined,
    sendLabels: raw.sendLabels,
    partPeaks: Array.isArray(raw.partPeaks) ? raw.partPeaks.map(Number) : undefined,
    partMidiPeaks: Array.isArray(raw.partMidiPeaks) ? raw.partMidiPeaks.map(Number) : undefined,
    lfoPhase: Number(raw.lfoPhase ?? 0), seqPlaying: Boolean(raw.seqPlaying),
    seqTick: Number(raw.seqTick ?? 0), seqStep: Number(raw.seqStep ?? 0),
    seqTotalTicks: Number(raw.seqTotalTicks ?? 384), bpm: Number(raw.bpm ?? 0),
    activeScene: raw.activeScene !== undefined ? Number(raw.activeScene) : undefined,
    queuedScene: raw.queuedScene !== undefined ? Number(raw.queuedScene) : undefined,
    songMode: raw.songMode !== undefined ? Boolean(raw.songMode) : undefined,
    songLoop: raw.songLoop !== undefined ? Boolean(raw.songLoop) : undefined,
    songBlockIdx: raw.songBlockIdx !== undefined ? Number(raw.songBlockIdx) : undefined,
    songBarInBlock: raw.songBarInBlock !== undefined ? Number(raw.songBarInBlock) : undefined,
    songBlockCount: raw.songBlockCount !== undefined ? Number(raw.songBlockCount) : undefined,
    sceneApplySeq: raw.sceneApplySeq !== undefined ? Number(raw.sceneApplySeq) : undefined,
    appliedMuteMask: raw.appliedMuteMask !== undefined ? Number(raw.appliedMuteMask) : undefined,
    appliedTranspose: raw.appliedTranspose !== undefined ? Number(raw.appliedTranspose) : undefined,
  };
}

export function parseSongScenesStateJson(json: string): McxSongScenesStateDto | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json);
    if (!d || typeof d !== 'object') return null;
    const scenes: McxSceneSlotDto[] = Array.isArray(d.scenes) ? d.scenes.map((s: any, idx: number) => ({
      index: Number(s?.index ?? idx), name: String(s?.name ?? `Scene ${idx + 1}`),
      muteMask: Number(s?.muteMask ?? 0) & 0xFFFF, transpose: Math.max(-24, Math.min(24, Number(s?.transpose ?? 0))),
    })) : [];
    const blocks: McxSongBlockDto[] = Array.isArray(d.blocks) ? d.blocks.map((b: any) => ({
      sceneIndex: Math.max(0, Math.min(7, Number(b?.sceneIndex ?? 0))),
      bars: Math.max(1, Math.min(32, Number(b?.bars ?? 4))),
      transposeOffset: Math.max(-12, Math.min(12, Number(b?.transposeOffset ?? 0))),
    })) : [];
    return {
      songMode: Boolean(d.songMode), songLoop: d.songLoop !== false,
      activeScene: Number(d.activeScene ?? 0), queuedScene: Number(d.queuedScene ?? -1),
      songBlockIdx: Number(d.songBlockIdx ?? 0), songBarInBlock: Number(d.songBarInBlock ?? 0),
      scenes, blocks,
    };
  } catch { return null; }
}
