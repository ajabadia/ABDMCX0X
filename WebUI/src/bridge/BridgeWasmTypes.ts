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
  lfoPhase?: number; lfo2Phase?: number;
  seqPlaying?: boolean; seqPaused?: boolean; seqCountInTicks?: number; seqRecRev?: number;
  seqTick?: number; seqStep?: number; seqTotalTicks?: number; bpm?: number;
  activeScene?: number; queuedScene?: number; songMode?: boolean; songLoop?: boolean;
  songBlockIdx?: number; songBarInBlock?: number; songBlockCount?: number; sceneApplySeq?: number;
  appliedMuteMask?: number; appliedMuteMask64?: number[]; appliedTranspose?: number;
  rackPeakIn?: number[]; rackPeakOut?: number[]; rackClipIn?: boolean[]; rackClipOut?: boolean[];
}

export interface McxSidechainConfigDto {
  sourcePart: number; hpfEnabled: boolean; hpfHz: number;
  depthDb: number; attackMs: number; releaseMs: number; releaseSyncDiv: number;
}
export interface McxWavRenderOptionsDto {
  scope: 'master' | 'part' | 'bank' | 'stems';
  part?: number; bank?: number; bars?: number; tailSec?: number; useSongMode?: boolean; filename?: string;
}
export interface McxWavRenderedDto {
  ok: boolean; requestId?: number; sampleRate: number; left: Float32Array; right: Float32Array;
}
export interface McxExportCompleteDto {
  ok: boolean; kind: string; path?: string; count?: number;
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
  presets: Array<{ index: number; name: string; categoryId?: number; isDrumMode?: boolean }>;
}

export interface McxPartEngineStateDto {
  part: number;
  engineTypeId: string;
  presetName: string;
  stateJson: string;
  coverDataUrl?: string;
}

export interface McxMidiDeviceInfoDto {
  portIndex: number;
  id: string;
  name: string;
  enabled: boolean;
}

export interface McxMidiDevicesDto {
  isStandalone: boolean;
  inputs: McxMidiDeviceInfoDto[];
  outputs: McxMidiDeviceInfoDto[];
}

export interface McxSceneSlotDto {
  index: number;
  name: string;
  muteMask: number;
  muteMask64?: [number, number, number, number];
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
    lfoPhase: Number(raw.lfoPhase ?? 0), lfo2Phase: Number(raw.lfo2Phase ?? 0), seqPlaying: Boolean(raw.seqPlaying),
    seqPaused: raw.seqPaused !== undefined ? Boolean(raw.seqPaused) : false,
    seqCountInTicks: raw.seqCountInTicks !== undefined ? Number(raw.seqCountInTicks) : 0,
    seqRecRev: raw.seqRecRev !== undefined ? Number(raw.seqRecRev) : 0,
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
    appliedMuteMask64: Array.isArray(raw.appliedMuteMask64) ? raw.appliedMuteMask64.map((v: any) => Number(v) & 0xFFFF) : undefined,
    appliedTranspose: raw.appliedTranspose !== undefined ? Number(raw.appliedTranspose) : undefined,
    rackPeakIn: Array.isArray(raw.rackPeakIn) ? raw.rackPeakIn.map(Number) : undefined,
    rackPeakOut: Array.isArray(raw.rackPeakOut) ? raw.rackPeakOut.map(Number) : undefined,
    rackClipIn: Array.isArray(raw.rackClipIn) ? raw.rackClipIn.map(Boolean) : undefined,
    rackClipOut: Array.isArray(raw.rackClipOut) ? raw.rackClipOut.map(Boolean) : undefined,
  };
}

export interface McxSessionPartDto {
  index: number; enabled?: boolean; name: string; kind: 'chromatic' | 'drum_map';
  midiChannel: number; midiPortIndex: number; midiInPortIndex?: number;
  midiOutDeviceName?: string; midiInDeviceName?: string;
  routeMode: number; mute: boolean; solo: boolean; followTranspose: boolean;
  engineTypeIndex: number; engineTypeId: string; partLevel: number; partPan: number;
  reverbSend: number; chorusSend: number; delaySend: number; auxSend: number;
  sendAPre: boolean; sendBPre: boolean; sendCPre: boolean; sendDPre: boolean; insertSlot: number;
  driveType: number; driveAmount: number; eqLowGain: number; eqMidGain: number; eqHighGain: number;
  filterCutoff: number; filterResonance: number; filterModel: number; structureMode: number;
  pitchCoarse: number; pitchFine: number;
  lfo1Shape: number; lfo1Sync: boolean; lfo1Rate: number; lfo1Depth: number; lfo1Target: number;
  lfo2Shape: number; lfo2Sync: boolean; lfo2Rate: number; lfo2Depth: number; lfo2Target: number;
}

export interface McxSessionStateDto {
  masterGain: number; globalTranspose: number; dacCharacter: number;
  reverbMacro: number; chorusMacro: number; limiterEnabled: boolean; limiterCeilingDb: number;
  fxTopology: number; sendTargets: number[]; rackJson: string; bankLayoutJson?: string;
  audioDuckEnabled?: boolean; midiDuckEnabled?: boolean; sidechainConfig?: McxSidechainConfigDto;
  parts: McxSessionPartDto[];
}

export function parseSongScenesStateJson(json: string): McxSongScenesStateDto | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json);
    if (!d || typeof d !== 'object') return null;
    const scenes: McxSceneSlotDto[] = Array.isArray(d.scenes) ? d.scenes.map((s: any, idx: number) => {
      const m16 = Number(s?.muteMask ?? 0) & 0xFFFF;
      const m64: [number, number, number, number] = Array.isArray(s?.muteMask64)
        ? [Number(s.muteMask64[0] ?? 0) & 0xFFFF, Number(s.muteMask64[1] ?? 0) & 0xFFFF,
           Number(s.muteMask64[2] ?? 0) & 0xFFFF, Number(s.muteMask64[3] ?? 0) & 0xFFFF]
        : [m16, 0, 0, 0];
      return {
        index: Number(s?.index ?? idx), name: String(s?.name ?? `Scene ${idx + 1}`),
        muteMask: m64[0], muteMask64: m64, transpose: Math.max(-24, Math.min(24, Number(s?.transpose ?? 0))),
      };
    }) : [];
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
