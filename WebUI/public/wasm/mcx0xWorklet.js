/**
 * ABDMCX0X -- AudioWorkletProcessor (mcx0xWorklet.js)
 * Runs the real C++20 McxEngine compiled to WebAssembly inside AudioWorkletGlobalScope.
 */
const MOTION_PARAM_IDS = { cutoff: 0, resonance: 1, pan: 7, sendA: 8, sendB: 9, sendC: 47, sendD: 48 };

class Mcx0xWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isReady = false; this.wasm = null; this.HEAPU8 = null; this.HEAP32 = null; this.HEAPF32 = null;
    this.outLPtr = 0; this.outRPtr = 0; this.peakLPtr = 0; this.peakRPtr = 0; this.activeVoicesPtr = 0; this.partPeaksPtr = 0; this.partMidiPeaksPtr = 0; this.seqStatePtr = 0; this.songStatePtr = 0;
    this.keyBufPtr = 0; this.rackPeaksPtr = 0; this.rackFlagsPtr = 0; this.telemetryCounter = 0; this.gcCounter = 0;
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
  _writeKey(key) {
    if (!this.keyBufPtr) return 0;
    if (this.HEAPU8.buffer !== this.wasm.memory.buffer) this._updateMemoryViews();
    const s = String(key || ''), len = Math.min(63, s.length);
    for (let i = 0; i < len; ++i) this.HEAPU8[this.keyBufPtr + i] = s.charCodeAt(i) & 0x7F;
    this.HEAPU8[this.keyBufPtr + len] = 0; return this.keyBufPtr;
  }
  _emitPartEngineState(part) {
    if (!this.wasm || typeof this.wasm.getPartEngineStateJson !== 'function') return;
    const p = part | 0;
    const engineTypeId = typeof this.wasm.getPartEngineTypeId === 'function' ? this._readCStr(this.wasm.getPartEngineTypeId(p)) : '';
    const presetName = typeof this.wasm.getPartCurrentPresetName === 'function' ? this._readCStr(this.wasm.getPartCurrentPresetName(p)) : '';
    this.port.postMessage({ type: 'PART_ENGINE_STATE', part: p, engineTypeId, presetName, stateJson: this._readCStr(this.wasm.getPartEngineStateJson(p)) });
  }
  _emitSongState() {
    if (this.wasm && typeof this.wasm.getSongScenesStateJson === 'function') this.port.postMessage({ type: 'SONG_SCENES_STATE', stateJson: this._readCStr(this.wasm.getSongScenesStateJson()) });
  }
  _readPeaks16(fnName, ptr) {
    if (!ptr || typeof this.wasm[fnName] !== 'function') return undefined;
    this.wasm[fnName](ptr); return Array.from(this.HEAPF32.subarray(ptr >> 2, (ptr >> 2) + 16));
  }
  _applyPattern(data) {
    if (typeof this.wasm.clearPartPattern !== 'function') return;
    const p = data.part | 0;
    if (data.bars && typeof this.wasm.setSequencerBars === 'function') this.wasm.setSequencerBars(data.bars | 0);
    this.wasm.clearPartPattern(p);
    const notes = Array.isArray(data.notes) ? data.notes : [];
    for (let i = 0; i < notes.length; ++i) { const n = notes[i]; this.wasm.addPartNote(p, n.startTick | 0, n.durationTicks | 0, n.midiNote | 0, (n.velocity ?? 100) | 0, n.slide ? 1 : 0); }
    const motion = data.motion && typeof data.motion === 'object' ? data.motion : {};
    let lane = 0;
    for (const [key, pts] of Object.entries(motion)) {
      const paramId = MOTION_PARAM_IDS[key];
      if (lane >= 4 || !Array.isArray(pts) || paramId === undefined) continue;
      for (let m = 0; m < pts.length; ++m) this.wasm.addPartMotionPoint(p, lane, paramId, pts[m].tick | 0, Number(pts[m].value ?? 0));
      lane++;
    }
    this.wasm.commitPartPattern(p);
  }
  _applySong(data) {
    if (!this.wasm || typeof this.wasm.clearSongBlocks !== 'function') return;
    this.wasm.clearSongBlocks();
    const blks = Array.isArray(data.blocks) ? data.blocks : [];
    for (let i = 0; i < blks.length; ++i) this.wasm.addSongBlock(blks[i].sceneIndex | 0, blks[i].bars | 0, blks[i].transposeOffset | 0);
    this.wasm.commitSongBlocks(data.loop === false ? 0 : 1); this._emitSongState();
  }
  handleMessage(data) {
    if (!data) return;
    if (data.type === 'INIT_WASM') { this.initWasm(data.binary, data.sampleRate || sampleRate); return; }
    if (!this.isReady || !this.wasm) return;
    switch (data.type) {
      case 'NOTE_ON': this.wasm.noteOn(data.part | 0, data.note | 0, Number(data.velocity ?? 0.85)); break;
      case 'NOTE_OFF': this.wasm.noteOff(data.part | 0, data.note | 0); break; case 'ALL_NOTES_OFF': this.wasm.allNotesOff(); break;
      case 'SET_PARAM': if (typeof data.paramId === 'number' && data.paramId >= 0) this.wasm.setPartParam(data.part | 0, data.paramId | 0, Number(data.value ?? 0)); break;
      case 'SET_TEMPO': this.wasm.setTempoBPM(Number(data.bpm ?? 120)); break; case 'SET_MASTER_VOLUME': this.wasm.setMasterVolume(Number(data.volume ?? 0.85)); break;
      case 'RESET_FACTORY': this.wasm.resetToFactory(); this._emitSongState(); this._emitPartEngineState(data.part ?? 0); break;
      case 'LOAD_BANK': this._uploadBankBuffer(data.buffer, false); break; case 'INDEX_BANK': this._uploadBankBuffer(data.buffer, true); break;
      case 'SET_TRANSPORT': this.wasm.setTransportPlaying?.(data.playing ? 1 : 0, data.resetOnStop === false ? 0 : 1); break;
      case 'SET_SEQ_BARS': this.wasm.setSequencerBars?.(data.bars | 0); break;
      case 'SET_GROOVE': this.wasm.setPartGroove?.(data.part | 0, data.mode | 0, data.algorithm | 0, data.resolution | 0, Number(data.amount ?? 0.5)); break;
      case 'SET_PATTERN': this._applyPattern(data); break;
      case 'SELECT_ENGINE': if (typeof this.wasm.selectPartEngineType === 'function') { this.wasm.selectPartEngineType(data.part | 0, data.typeIndex | 0); this._emitPartEngineState(data.part); } break;
      case 'LOAD_FACTORY_PRESET': if (typeof this.wasm.loadPartFactoryPreset === 'function') { this.wasm.loadPartFactoryPreset(data.part | 0, data.presetIndex | 0); this._emitPartEngineState(data.part); } break;
      case 'SET_ENGINE_PARAM': this.wasm.setPartEngineParamByKey?.(data.part | 0, this._writeKey(data.key), Number(data.value ?? 0)); break;
      case 'GET_ENGINE_STATE': this._emitPartEngineState(data.part); break;
      case 'LOAD_BANK_ITEM': this._loadBankItem(data); break;
      case 'COLLECT_WAVES': this.wasm.collectUnusedWaves?.(); break; case 'TRIGGER_SCENE': this.wasm.triggerScene?.(data.sceneIndex | 0, data.immediate ? 1 : 0); break;
      case 'CAPTURE_SCENE': this.wasm.captureScene?.(data.sceneIndex | 0); this._emitSongState(); break;
      case 'UPDATE_SCENE': this.wasm.updateSceneSlot?.(data.sceneIndex | 0, data.muteMask | 0, data.transpose | 0, this._writeKey(data.name || '')); this._emitSongState(); break;
      case 'SET_SONG_MODE': this.wasm.setSongModeEnabled?.(data.enabled ? 1 : 0); this._emitSongState(); break;
      case 'SET_SONG_LOOP': this.wasm.setSongLoopEnabled?.(data.loop ? 1 : 0); break; case 'JUMP_SONG_BLOCK': this.wasm.jumpSongBlock?.(data.blockIndex | 0, data.immediate ? 1 : 0); break;
      case 'SET_SONG_ARRANGEMENT': this._applySong(data); break;
      case 'GET_SONG_STATE': this._emitSongState(); break;
      case 'SET_RACK_SLOT': this.wasm.setRackSlotEngine?.(data.slot | 0, data.engine | 0, this._writeKey(data.name || '')); break; case 'SET_RACK_NAME': this.wasm.setRackSlotName?.(data.slot | 0, this._writeKey(data.name || '')); break;
      case 'REMOVE_RACK_SLOT': this.wasm.removeRackSlot?.(data.slot | 0); break; case 'MOVE_RACK_SLOT': this.wasm.moveRackSlot?.(data.from | 0, data.to | 0); break;
      case 'SET_RACK_BYPASS': this.wasm.setRackSlotBypass?.(data.slot | 0, data.bypass ? 1 : 0); break;
      case 'SET_RACK_PARAMS': this.wasm.setRackSlotParams?.(data.slot | 0, Number(data.p1 ?? 0.5), Number(data.p2 ?? 0.5), Number(data.mix ?? 1.0)); break;
      case 'SET_RACK_PARAM_KEY': this.wasm.setRackSlotParamByKey?.(data.slot | 0, this._writeKey(data.key), Number(data.value ?? 0)); break;
      case 'SET_RACK_PRESET': this.wasm.setRackSlotPreset?.(data.slot | 0, data.preset | 0); break; case 'SET_RACK_DUCKING': this.wasm.setRackSlotDucking?.(data.slot | 0, data.enabled ? 1 : 0, Number(data.amount ?? 0.6)); break;
      case 'SET_PART_INSERT': this.wasm.setPartInsertSlot?.(data.part | 0, data.slot | 0); break;
      case 'SET_SEND_SLOT_TARGET': this.wasm.setSendSlotTarget?.(data.bus | 0, data.slot | 0); break; case 'SET_SLOT_CHAIN_TARGET': this.wasm.setSlotChainTarget?.(data.slot | 0, data.target | 0); break;
      default: break;
    }
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
      const slot = typeof this.wasm.indexBankFromMemory === 'function' ? this.wasm.indexBankFromMemory(ptr, bytes.length) : -1;
      this.wasm.free(ptr); this.port.postMessage({ type: 'BANK_INDEXED', ok: slot >= 0, slot, sizeBytes: bytes.length });
    } else {
      const ok = this.wasm.loadBankFromMemory(ptr, bytes.length) === 1;
      this.wasm.free(ptr); this.port.postMessage({ type: 'BANK_LOADED', ok, sizeBytes: bytes.length });
    }
  }
  async initWasm(wasmBinary, sr) {
    try {
      const baseImports = {
        __cxa_throw: (ptr) => console.error('[Mcx0xWorklet] C++ exception ptr=' + ptr),
        _abort_js: () => console.error('[Mcx0xWorklet] WASM abort'), abort: () => console.error('[Mcx0xWorklet] WASM abort()'),
        emscripten_notify_memory_growth: () => this._updateMemoryViews(),
        emscripten_resize_heap: (req) => { const old = this.HEAPU8 ? this.HEAPU8.length : 0, p = Math.max(1, ((req - old + 65535) / 65536) | 0); try { this.wasm.memory.grow(p); this._updateMemoryViews(); return 1; } catch { return 0; } },
        clock_time_get: (_clk, _prec, ptime) => { if (this.wasm?.memory && ptime) new DataView(this.wasm.memory.buffer).setBigUint64(ptime, BigInt(Math.floor((currentTime || 0) * 1e9)), true); return 0; },
      };
      const proxy = new Proxy(baseImports, { get(t, p) { return p in t ? t[p] : () => 0; } });
      const compiled = await WebAssembly.compile(wasmBinary);
      const importObj = { env: proxy, wasi_snapshot_preview1: proxy, a: proxy };
      for (const imp of WebAssembly.Module.imports(compiled)) if (!(imp.module in importObj)) importObj[imp.module] = proxy;
      const instance = await WebAssembly.instantiate(compiled, importObj);
      this.wasm = instance.exports;
      if (!this.wasm || !this.wasm.memory || typeof this.wasm.initEngine !== 'function') throw new Error('WASM missing exports');
      if (typeof this.wasm.__wasm_call_ctors === 'function') this.wasm.__wasm_call_ctors();
      else if (typeof this.wasm._initialize === 'function') this.wasm._initialize();
      this._updateMemoryViews(); this.wasm.initEngine(sr); this.wasm.resetToFactory();
      this.outLPtr = this.wasm.malloc(2048); this.outRPtr = this.wasm.malloc(2048);
      this.peakLPtr = this.wasm.malloc(4); this.peakRPtr = this.wasm.malloc(4); this.activeVoicesPtr = this.wasm.malloc(4);
      this.partPeaksPtr = this.wasm.malloc(64); this.partMidiPeaksPtr = this.wasm.malloc(64); this.seqStatePtr = this.wasm.malloc(16);
      this.songStatePtr = this.wasm.malloc(40); this.keyBufPtr = this.wasm.malloc(64); this.midiBufPtr = this.wasm.malloc(512);
      this.rackPeaksPtr = this.wasm.malloc(64); this.rackFlagsPtr = this.wasm.malloc(64);
      if (this.HEAPF32.buffer !== this.wasm.memory.buffer) this._updateMemoryViews();
      this.isReady = true;
      this.port.postMessage({ type: 'WASM_READY', sampleRate: sr });
      this._emitSongState();
    } catch (err) { this.port.postMessage({ type: 'WASM_ERROR', message: String(err?.message || err) }); }
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    if (!this.isReady || !out || out.length === 0) return true;
    const outL = out[0], outR = out.length > 1 ? out[1] : null, n = outL.length;
    if (n <= 0 || n > 512) return true;
    this.wasm.processAudio(this.outLPtr, this.outRPtr, n);
    if (this.HEAPF32.buffer !== this.wasm.memory.buffer) this._updateMemoryViews();
    const offL = this.outLPtr >> 2, offR = this.outRPtr >> 2;
    outL.set(this.HEAPF32.subarray(offL, offL + n));
    if (outR) outR.set(this.HEAPF32.subarray(offR, offR + n));
    if (this.midiBufPtr && typeof this.wasm.drainMidiOut === 'function') {
      const mn = this.wasm.drainMidiOut(this.midiBufPtr, 512);
      if (mn > 0) {
        const mCopy = new Uint8Array(mn); mCopy.set(this.HEAPU8.subarray(this.midiBufPtr, this.midiBufPtr + mn));
        this.port.postMessage({ type: 'MIDI_OUT', bytes: mCopy }, [mCopy.buffer]);
      }
    }
    if (++this.telemetryCounter >= 12) {
      this.telemetryCounter = 0; this.wasm.getAudioSnapshot(this.peakLPtr, this.peakRPtr, this.activeVoicesPtr);
      const activeVoices = this.HEAP32[this.activeVoicesPtr >> 2];
      if (activeVoices === 0 && ++this.gcCounter >= 25 && typeof this.wasm.collectUnusedWaves === 'function') { this.gcCounter = 0; this.wasm.collectUnusedWaves(); }
      const partPeaks = this._readPeaks16('getPartPeaks', this.partPeaksPtr), partMidiPeaks = this._readPeaks16('getPartMidiPeaks', this.partMidiPeaksPtr);
      let rPkIn = [], rPkOut = [], rClIn = [], rClOut = [];
      if (this.rackPeaksPtr && typeof this.wasm.getAllRackSlotsTelemetry === 'function') {
        this.wasm.getAllRackSlotsTelemetry(this.rackPeaksPtr, this.rackFlagsPtr);
        const pO = this.rackPeaksPtr >> 2, fO = this.rackFlagsPtr >> 2;
        rPkIn = Array.from(this.HEAPF32.subarray(pO, pO + 8)); rPkOut = Array.from(this.HEAPF32.subarray(pO + 8, pO + 16));
        rClIn = Array.from(this.HEAP32.subarray(fO, fO + 8), v => v !== 0); rClOut = Array.from(this.HEAP32.subarray(fO + 8, fO + 16), v => v !== 0);
      }
      let seqPlaying = false, seqTick = 0, seqStep = 0, seqTotalTicks = 384, songTel = {};
      if (this.seqStatePtr && typeof this.wasm.getSequencerState === 'function') {
        const b = this.seqStatePtr, sOff = b >> 2; this.wasm.getSequencerState(b, b + 4, b + 8, b + 12);
        seqPlaying = this.HEAP32[sOff] !== 0; seqTick = this.HEAP32[sOff + 1]; seqStep = this.HEAP32[sOff + 2]; seqTotalTicks = this.HEAP32[sOff + 3];
      }
      if (this.songStatePtr && typeof this.wasm.getSongSceneTelemetry === 'function') {
        this.wasm.getSongSceneTelemetry(this.songStatePtr);
        const g = this.songStatePtr >> 2, h = this.HEAP32;
        songTel = { activeScene: h[g], queuedScene: h[g + 1], songMode: h[g + 2] !== 0, songLoop: h[g + 3] !== 0, songBlockIdx: h[g + 4], songBarInBlock: h[g + 5], songBlockCount: h[g + 6], sceneApplySeq: h[g + 7] >>> 0, appliedMuteMask: h[g + 8] & 0xFFFF, appliedTranspose: h[g + 9] };
      }
      const scopeCopy = new Float32Array(n); scopeCopy.set(outL);
      this.port.postMessage({ type: 'TELEMETRY', peakL: this.HEAPF32[this.peakLPtr >> 2], peakR: this.HEAPF32[this.peakRPtr >> 2], activeVoices, partPeaks, partMidiPeaks, rackPeakIn: rPkIn, rackPeakOut: rPkOut, rackClipIn: rClIn, rackClipOut: rClOut, seqPlaying, seqTick, seqStep, seqTotalTicks, ...songTel, samplesL: scopeCopy }, [scopeCopy.buffer]);
    }
    return true;
  }
}
registerProcessor('mcx0x-worklet-processor', Mcx0xWorkletProcessor);
