/**
 * ABDMCX0X -- AudioWorkletProcessor (mcx0xWorklet.js)
 * Runs the real C++20 McxEngine compiled to WebAssembly inside AudioWorkletGlobalScope.
 */
const MOTION_PARAM_IDS = { cutoff: 0, resonance: 1, pan: 7, sendA: 8, sendB: 9, sendC: 47, sendD: 48 };

class Mcx0xWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isReady = false; this.wasm = null; this.HEAPU8 = null; this.HEAP32 = null; this.HEAPF32 = null;
    this.outLPtr = 0; this.outRPtr = 0; this.peakLPtr = 0; this.peakRPtr = 0; this.activeVoicesPtr = 0;
    this.partPeaksPtr = 0; this.partMidiPeaksPtr = 0; this.seqStatePtr = 0; this.songStatePtr = 0;
    this.keyBufPtr = 0; this.layoutBufPtr = 0; this.midiBufPtr = 0; this.rackPeaksPtr = 0; this.rackFlagsPtr = 0;
    this.fxTelPtr = 0; this.fxMutePtr = 0; this.telemetryCounter = 0; this.gcCounter = 0;
    this.handlers = this._buildHandlers();
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }
  _updateMemoryViews() { const b = this.wasm.memory.buffer; this.HEAPU8 = new Uint8Array(b); this.HEAP32 = new Int32Array(b); this.HEAPF32 = new Float32Array(b); }
  _readCStr(ptr) {
    if (!ptr) return '';
    if (this.HEAPU8.buffer !== this.wasm.memory.buffer) this._updateMemoryViews();
    let end = ptr, s = ''; while (end < this.HEAPU8.length && this.HEAPU8[end] !== 0) ++end;
    for (let i = ptr; i < end; ++i) s += String.fromCharCode(this.HEAPU8[i]);
    return s;
  }
  _writeText(ptr, maxBytes, txt) {
    if (!ptr) return 0;
    if (this.HEAPU8.buffer !== this.wasm.memory.buffer) this._updateMemoryViews();
    const s = String(txt || ''), len = Math.min(maxBytes - 1, s.length);
    for (let i = 0; i < len; ++i) this.HEAPU8[ptr + i] = s.charCodeAt(i) & 0x7F;
    this.HEAPU8[ptr + len] = 0; return ptr;
  }
  _writeKey(key) { return this._writeText(this.keyBufPtr, 64, key); }
  _emitPartEngineState(part) {
    const w = this.wasm; if (!w || typeof w.getPartEngineStateJson !== 'function') return;
    const p = part | 0, engineTypeId = w.getPartEngineTypeId ? this._readCStr(w.getPartEngineTypeId(p)) : '';
    const presetName = w.getPartCurrentPresetName ? this._readCStr(w.getPartCurrentPresetName(p)) : '';
    this.port.postMessage({ type: 'PART_ENGINE_STATE', part: p, engineTypeId, presetName, stateJson: this._readCStr(w.getPartEngineStateJson(p)) });
  }
  _emitSongState() { if (this.wasm?.getSongScenesStateJson) this.port.postMessage({ type: 'SONG_SCENES_STATE', stateJson: this._readCStr(this.wasm.getSongScenesStateJson()) }); }
  _readPeaks64(fnName, ptr) {
    if (!ptr || typeof this.wasm[fnName] !== 'function') return undefined;
    this.wasm[fnName](ptr); return Array.from(this.HEAPF32.subarray(ptr >> 2, (ptr >> 2) + 64));
  }
  _applyPattern(d) {
    const w = this.wasm; if (!w?.clearPartPattern) return;
    const p = d.part | 0; if (d.bars) w.setSequencerBars?.(d.bars | 0);
    w.clearPartPattern(p);
    const notes = Array.isArray(d.notes) ? d.notes : [];
    for (let i = 0; i < notes.length; ++i) { const n = notes[i]; w.addPartNote(p, n.startTick | 0, n.durationTicks | 0, n.midiNote | 0, (n.velocity ?? 100) | 0, n.slide ? 1 : 0); }
    let lane = 0;
    for (const [key, pts] of Object.entries(d.motion && typeof d.motion === 'object' ? d.motion : {})) {
      const pid = MOTION_PARAM_IDS[key]; if (lane >= 4 || !Array.isArray(pts) || pid === undefined) continue;
      for (let m = 0; m < pts.length; ++m) w.addPartMotionPoint(p, lane, pid, pts[m].tick | 0, Number(pts[m].value ?? 0));
      lane++;
    }
    w.commitPartPattern(p);
  }
  _applySong(d) {
    const w = this.wasm; if (!w?.clearSongBlocks) return;
    w.clearSongBlocks(); const blks = Array.isArray(d.blocks) ? d.blocks : [];
    for (let i = 0; i < blks.length; ++i) w.addSongBlock(blks[i].sceneIndex | 0, blks[i].bars | 0, blks[i].transposeOffset | 0);
    w.commitSongBlocks(d.loop === false ? 0 : 1); this._emitSongState();
  }
  _buildHandlers() {
    return {
      NOTE_ON: (w, d) => w.noteOn(d.part | 0, d.note | 0, Number(d.velocity ?? 0.85)),
      NOTE_OFF: (w, d) => w.noteOff(d.part | 0, d.note | 0), ALL_NOTES_OFF: (w) => w.allNotesOff(),
      SET_PARAM: (w, d) => { if (typeof d.paramId === 'number' && d.paramId >= 0) w.setPartParam(d.part | 0, d.paramId | 0, Number(d.value ?? 0)); },
      SET_TEMPO: (w, d) => w.setTempoBPM(Number(d.bpm ?? 120)), SET_MASTER_VOLUME: (w, d) => w.setMasterVolume(Number(d.volume ?? 0.85)),
      RESET_FACTORY: (w, d) => { w.resetToFactory(); this._emitSongState(); this._emitPartEngineState(d.part ?? 0); },
      LOAD_BANK: (_w, d) => this._uploadBankBuffer(d.buffer, false), INDEX_BANK: (_w, d) => this._uploadBankBuffer(d.buffer, true),
      SET_TRANSPORT: (w, d) => w.setTransportPlaying?.(d.playing ? 1 : 0, d.resetOnStop === false ? 0 : 1), SET_SEQ_BARS: (w, d) => w.setSequencerBars?.(d.bars | 0), SET_SEQ_LOOP: (w, d) => w.setSequencerLoop?.(d.loop ? 1 : 0),
      SET_GROOVE: (w, d) => w.setPartGroove?.(d.part | 0, d.mode | 0, d.algorithm | 0, d.resolution | 0, Number(d.amount ?? 0.5)), SET_PATTERN: (_w, d) => this._applyPattern(d),
      SELECT_ENGINE: (w, d) => { if (w.selectPartEngineType) { w.selectPartEngineType(d.part | 0, d.typeIndex | 0); this._emitPartEngineState(d.part); } },
      LOAD_FACTORY_PRESET: (w, d) => { if (w.loadPartFactoryPreset) { w.loadPartFactoryPreset(d.part | 0, d.presetIndex | 0); this._emitPartEngineState(d.part); } },
      SET_ENGINE_PARAM: (w, d) => w.setPartEngineParamByKey?.(d.part | 0, this._writeKey(d.key), Number(d.value ?? 0)), SET_PART_PRESET_NAME: (w, d) => w.setPartPresetName?.(d.part | 0, this._writeKey(d.name || '')),
      GET_ENGINE_STATE: (_w, d) => this._emitPartEngineState(d.part), LOAD_BANK_ITEM: (_w, d) => this._loadBankItem(d), COLLECT_WAVES: (w) => w.collectUnusedWaves?.(),
      GET_ENGINE_CATALOG: (w) => { if (w.getRegisteredEngineCatalogJson) this.port.postMessage({ type: 'ENGINE_CATALOG', catalogJson: this._readCStr(w.getRegisteredEngineCatalogJson()) }); },
      GET_PART_PRESETS: (w, d) => { if (w.getPartPresetsJson) this.port.postMessage({ type: 'PART_PRESETS', presetsJson: this._readCStr(w.getPartPresetsJson(d.part | 0)) }); },
      GET_RACK_STATE: (w) => { if (w.getRackSlotsStateJson) this.port.postMessage({ type: 'RACK_STATE', rackJson: this._readCStr(w.getRackSlotsStateJson()) }); },
      TRIGGER_SCENE: (w, d) => w.triggerScene?.(d.sceneIndex | 0, d.immediate ? 1 : 0), CAPTURE_SCENE: (w, d) => { w.captureScene?.(d.sceneIndex | 0); this._emitSongState(); },
      UPDATE_SCENE: (w, d) => {
        if (Array.isArray(d.muteMask64) && typeof w.updateSceneSlot64 === 'function') w.updateSceneSlot64(d.sceneIndex | 0, d.muteMask64[0] | 0, d.muteMask64[1] | 0, d.muteMask64[2] | 0, d.muteMask64[3] | 0, d.transpose | 0, this._writeKey(d.name || ''));
        else w.updateSceneSlot?.(d.sceneIndex | 0, d.muteMask | 0, d.transpose | 0, this._writeKey(d.name || ''));
        this._emitSongState();
      },
      SET_BANK_LAYOUT: (w, d) => w.setBankLayoutJson?.(this._writeText(this.layoutBufPtr, 2048, d.layoutJson || '')),
      MIDI_IN: (w, d) => w.routeMidiInBytes?.(d.portIndex | 0, d.status | 0, d.data1 | 0, d.data2 | 0),
      SET_SONG_MODE: (w, d) => { w.setSongModeEnabled?.(d.enabled ? 1 : 0); this._emitSongState(); }, SET_SONG_LOOP: (w, d) => w.setSongLoopEnabled?.(d.loop ? 1 : 0),
      JUMP_SONG_BLOCK: (w, d) => w.jumpSongBlock?.(d.blockIndex | 0, d.immediate ? 1 : 0), SET_SONG_ARRANGEMENT: (_w, d) => this._applySong(d), GET_SONG_STATE: () => this._emitSongState(),
      SET_RACK_SLOT: (w, d) => w.setRackSlotEngine?.(d.slot | 0, d.engine | 0, this._writeKey(d.name || '')), SET_RACK_NAME: (w, d) => w.setRackSlotName?.(d.slot | 0, this._writeKey(d.name || '')),
      REMOVE_RACK_SLOT: (w, d) => w.removeRackSlot?.(d.slot | 0), MOVE_RACK_SLOT: (w, d) => w.moveRackSlot?.(d.from | 0, d.to | 0),
      SET_RACK_BYPASS: (w, d) => w.setRackSlotBypass?.(d.slot | 0, d.bypass ? 1 : 0), SET_RACK_PRESET: (w, d) => w.setRackSlotPreset?.(d.slot | 0, d.preset | 0),
      SET_RACK_PARAMS: (w, d) => w.setRackSlotParams?.(d.slot | 0, Number(d.p1 ?? 0.5), Number(d.p2 ?? 0.5), Number(d.mix ?? 1.0)),
      SET_RACK_PARAM_KEY: (w, d) => w.setRackSlotParamByKey?.(d.slot | 0, this._writeKey(d.key), Number(d.value ?? 0)),
      SET_RACK_DUCKING: (w, d) => w.setRackSlotDucking?.(d.slot | 0, d.enabled ? 1 : 0, Number(d.amount ?? 0.6)),
      SET_PART_INSERT: (w, d) => w.setPartInsertSlot?.(d.part | 0, d.slot | 0), SET_SEND_SLOT_TARGET: (w, d) => w.setSendSlotTarget?.(d.bus | 0, d.slot | 0),
      SET_SLOT_CHAIN_TARGET: (w, d) => w.setSlotChainTarget?.(d.slot | 0, d.target | 0), SET_SEND_BUS_MUTE: (w, d) => w.setSendBusMute?.(d.bus | 0, d.mute ? 1 : 0),
      SET_FX_TOPOLOGY: (w, d) => w.setFxTopology?.(d.topology | 0), SET_FX_CASCADE: (w, d) => w.setFxCascade?.(Number(d.cho ?? 0.25), Number(d.del ?? 0.15)),
      SET_FX_GATE: (w, d) => w.setFxGate?.(d.gate | 0, d.value >= 0.5 ? 1 : 0), SET_FX_TEMPO_SYNC: (w, d) => w.setFxTempoSync?.(d.enabled ? 1 : 0),
      SET_LIMITER_ENABLED: (w, d) => w.setLimiterEnabled?.(d.enabled ? 1 : 0), SET_LIMITER_CEILING: (w, d) => w.setLimiterCeilingDb?.(Number(d.db ?? -0.3)),
      SET_DUCK_MODE: (w, d) => w.setDuckMode?.(d.kind | 0, d.enabled ? 1 : 0),
    };
  }
  handleMessage(data) {
    if (!data) return;
    if (data.type === 'INIT_WASM') { this.initWasm(data.binary, data.sampleRate || sampleRate); return; }
    if (!this.isReady || !this.wasm) return;
    this.handlers[data.type]?.(this.wasm, data);
  }
  _loadBankItem(data) {
    const fn = data.kind === 'drum_kit' ? 'loadIndexedKitOnDemand' : 'loadIndexedToneOnDemand';
    if (typeof this.wasm[fn] === 'function' && this.wasm[fn](data.bankSlot | 0, data.itemIndex | 0, data.part | 0) === 1) this._emitPartEngineState(data.part);
  }
  _uploadBankBuffer(arrayBuffer, indexOnly) {
    if (!arrayBuffer || !this.wasm || typeof this.wasm.malloc !== 'function') return;
    const bytes = new Uint8Array(arrayBuffer), ptr = this.wasm.malloc(bytes.length);
    if (!ptr) { this.port.postMessage({ type: indexOnly ? 'BANK_INDEXED' : 'BANK_LOADED', ok: false, slot: -1 }); return; }
    if (this.HEAPU8.buffer !== this.wasm.memory.buffer) this._updateMemoryViews();
    this.HEAPU8.set(bytes, ptr);
    if (indexOnly) {
      const slot = this.wasm.indexBankFromMemory ? this.wasm.indexBankFromMemory(ptr, bytes.length) : -1;
      this.wasm.free(ptr); this.port.postMessage({ type: 'BANK_INDEXED', ok: slot >= 0, slot, sizeBytes: bytes.length });
    } else {
      const ok = this.wasm.loadBankFromMemory(ptr, bytes.length) === 1;
      this.wasm.free(ptr); this.port.postMessage({ type: 'BANK_LOADED', ok, sizeBytes: bytes.length });
    }
  }
  async initWasm(wasmBinary, sr) {
    try {
      const base = {
        __cxa_throw: (p) => console.error('[Mcx0xWorklet] C++ exception ptr=' + p),
        _abort_js: () => console.error('[Mcx0xWorklet] WASM abort'), abort: () => console.error('[Mcx0xWorklet] WASM abort()'),
        emscripten_notify_memory_growth: () => this._updateMemoryViews(),
        emscripten_resize_heap: (r) => { const o = this.HEAPU8 ? this.HEAPU8.length : 0, p = Math.max(1, ((r - o + 65535) / 65536) | 0); try { this.wasm.memory.grow(p); this._updateMemoryViews(); return 1; } catch { return 0; } },
        clock_time_get: (_c, _p, pt) => { if (this.wasm?.memory && pt) new DataView(this.wasm.memory.buffer).setBigUint64(pt, BigInt(Math.floor((currentTime || 0) * 1e9)), true); return 0; },
      };
      const proxy = new Proxy(base, { get: (t, p) => (p in t ? t[p] : () => 0) });
      const compiled = await WebAssembly.compile(wasmBinary), importObj = { env: proxy, wasi_snapshot_preview1: proxy, a: proxy };
      for (const imp of WebAssembly.Module.imports(compiled)) if (!(imp.module in importObj)) importObj[imp.module] = proxy;
      const instance = await WebAssembly.instantiate(compiled, importObj); this.wasm = instance.exports;
      if (!this.wasm?.memory || typeof this.wasm.initEngine !== 'function') throw new Error('WASM missing exports');
      if (this.wasm.__wasm_call_ctors) this.wasm.__wasm_call_ctors(); else this.wasm._initialize?.();
      this._updateMemoryViews(); this.wasm.initEngine(sr); this.wasm.resetToFactory();
      const alloc = (sz) => this.wasm.malloc(sz);
      this.outLPtr = alloc(2048); this.outRPtr = alloc(2048); this.peakLPtr = alloc(4); this.peakRPtr = alloc(4); this.activeVoicesPtr = alloc(4);
      this.partPeaksPtr = alloc(256); this.partMidiPeaksPtr = alloc(256); this.seqStatePtr = alloc(16); this.songStatePtr = alloc(56);
      this.keyBufPtr = alloc(64); this.layoutBufPtr = alloc(2048); this.midiBufPtr = alloc(512); this.rackPeaksPtr = alloc(64); this.rackFlagsPtr = alloc(64);
      this.fxTelPtr = alloc(28); this.fxMutePtr = alloc(16);
      if (this.HEAPF32.buffer !== this.wasm.memory.buffer) this._updateMemoryViews();
      this.isReady = true; this.port.postMessage({ type: 'WASM_READY', sampleRate: sr }); this._emitSongState();
    } catch (err) { this.port.postMessage({ type: 'WASM_ERROR', message: String(err?.message || err) }); }
  }
  process(_inputs, outputs) {
    const out = outputs[0]; if (!this.isReady || !out || out.length === 0) return true;
    const outL = out[0], outR = out.length > 1 ? out[1] : null, n = outL.length;
    if (n <= 0 || n > 512) return true;
    this.wasm.processAudio(this.outLPtr, this.outRPtr, n);
    if (this.HEAPF32.buffer !== this.wasm.memory.buffer) this._updateMemoryViews();
    const offL = this.outLPtr >> 2, offR = this.outRPtr >> 2;
    outL.set(this.HEAPF32.subarray(offL, offL + n)); if (outR) outR.set(this.HEAPF32.subarray(offR, offR + n));
    if (this.midiBufPtr && this.wasm.drainMidiOut) {
      const mn = this.wasm.drainMidiOut(this.midiBufPtr, 512);
      if (mn > 0) { const mc = new Uint8Array(mn); mc.set(this.HEAPU8.subarray(this.midiBufPtr, this.midiBufPtr + mn)); this.port.postMessage({ type: 'MIDI_OUT', bytes: mc }, [mc.buffer]); }
    }
    if (++this.telemetryCounter >= 12) {
      this.telemetryCounter = 0; this.wasm.getAudioSnapshot(this.peakLPtr, this.peakRPtr, this.activeVoicesPtr);
      const activeVoices = this.HEAP32[this.activeVoicesPtr >> 2];
      if (activeVoices === 0 && ++this.gcCounter >= 25) { this.gcCounter = 0; this.wasm.collectUnusedWaves?.(); }
      const partPeaks = this._readPeaks64('getPartPeaks', this.partPeaksPtr), partMidiPeaks = this._readPeaks64('getPartMidiPeaks', this.partMidiPeaksPtr);
      let rPkIn = [], rPkOut = [], rClIn = [], rClOut = [], seqTel = {}, songTel = {}, fxTel = {};
      if (this.rackPeaksPtr && this.wasm.getAllRackSlotsTelemetry) {
        this.wasm.getAllRackSlotsTelemetry(this.rackPeaksPtr, this.rackFlagsPtr);
        const pO = this.rackPeaksPtr >> 2, fO = this.rackFlagsPtr >> 2;
        rPkIn = Array.from(this.HEAPF32.subarray(pO, pO + 8)); rPkOut = Array.from(this.HEAPF32.subarray(pO + 8, pO + 16));
        rClIn = Array.from(this.HEAP32.subarray(fO, fO + 8), v => v !== 0); rClOut = Array.from(this.HEAP32.subarray(fO + 8, fO + 16), v => v !== 0);
      }
      if (this.seqStatePtr && this.wasm.getSequencerState) {
        const b = this.seqStatePtr, sO = b >> 2; this.wasm.getSequencerState(b, b + 4, b + 8, b + 12);
        seqTel = { seqPlaying: this.HEAP32[sO] !== 0, seqTick: this.HEAP32[sO + 1], seqStep: this.HEAP32[sO + 2], seqTotalTicks: this.HEAP32[sO + 3] };
      }
      if (this.songStatePtr && this.wasm.getSongSceneTelemetry) {
        this.wasm.getSongSceneTelemetry(this.songStatePtr);
        const g = this.songStatePtr >> 2, h = this.HEAP32;
        songTel = { activeScene: h[g], queuedScene: h[g + 1], songMode: h[g + 2] !== 0, songLoop: h[g + 3] !== 0, songBlockIdx: h[g + 4], songBarInBlock: h[g + 5], songBlockCount: h[g + 6], sceneApplySeq: h[g + 7] >>> 0, appliedMuteMask: h[g + 8] & 0xFFFF, appliedMuteMask64: [h[g + 10] & 0xFFFF, h[g + 11] & 0xFFFF, h[g + 12] & 0xFFFF, h[g + 13] & 0xFFFF], appliedTranspose: h[g + 9] };
      }
      if (this.fxTelPtr && this.wasm.getMasterFxTelemetry) {
        this.wasm.getMasterFxTelemetry(this.fxTelPtr, this.fxMutePtr);
        const ft = this.fxTelPtr >> 2, fm = this.fxMutePtr >> 2, f = this.HEAPF32, h = this.HEAP32;
        fxTel = { peakSendA: f[ft], peakSendB: f[ft + 1], peakSendC: f[ft + 2], peakSendD: f[ft + 3], limiterGrDb: f[ft + 4], lfoPhase: f[ft + 5], lfo2Phase: f[ft + 6], sendBusMutes: [0, 1, 2, 3].map(k => h[fm + k] !== 0) };
      }
      const scopeCopy = new Float32Array(n); scopeCopy.set(outL);
      this.port.postMessage({ type: 'TELEMETRY', peakL: this.HEAPF32[this.peakLPtr >> 2], peakR: this.HEAPF32[this.peakRPtr >> 2], activeVoices, partPeaks, partMidiPeaks, rackPeakIn: rPkIn, rackPeakOut: rPkOut, rackClipIn: rClIn, rackClipOut: rClOut, ...seqTel, ...songTel, ...fxTel, samplesL: scopeCopy }, [scopeCopy.buffer]);
    }
    return true;
  }
}
registerProcessor('mcx0x-worklet-processor', Mcx0xWorkletProcessor);
