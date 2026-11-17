/**
 * ABDMCX0X -- AudioWorkletProcessor (mcx0xWorklet.js)
 * Runs the real C++20 McxEngine compiled to WebAssembly inside AudioWorkletGlobalScope.
 */

class Mcx0xWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isReady = false;
    this.wasm = null;
    this.HEAPU8 = null;
    this.HEAP32 = null;
    this.HEAPF32 = null;

    this.outLPtr = 0;
    this.outRPtr = 0;
    this.peakLPtr = 0;
    this.peakRPtr = 0;
    this.activeVoicesPtr = 0;
    this.telemetryCounter = 0;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  _updateMemoryViews() {
    const buf = this.wasm.memory.buffer;
    this.HEAPU8 = new Uint8Array(buf);
    this.HEAP32 = new Int32Array(buf);
    this.HEAPF32 = new Float32Array(buf);
  }

  handleMessage(data) {
    if (!data) return;
    if (data.type === 'INIT_WASM') {
      this.initWasm(data.binary, data.sampleRate || sampleRate);
      return;
    }
    if (!this.isReady || !this.wasm) return;

    switch (data.type) {
      case 'NOTE_ON':
        this.wasm.noteOn(data.part | 0, data.note | 0, Number(data.velocity ?? 0.85));
        break;
      case 'NOTE_OFF':
        this.wasm.noteOff(data.part | 0, data.note | 0);
        break;
      case 'ALL_NOTES_OFF':
        this.wasm.allNotesOff();
        break;
      case 'SET_PARAM':
        this.wasm.setPartParam(data.part | 0, data.paramId | 0, Number(data.value ?? 0));
        break;
      case 'SET_TEMPO':
        this.wasm.setTempoBPM(Number(data.bpm ?? 120));
        break;
      case 'SET_MASTER_VOLUME':
        this.wasm.setMasterVolume(Number(data.volume ?? 0.85));
        break;
      case 'RESET_FACTORY':
        this.wasm.resetToFactory();
        break;
      case 'LOAD_BANK':
        this._loadBankBinary(data.buffer);
        break;
      default:
        break;
    }
  }

  _loadBankBinary(arrayBuffer) {
    if (!arrayBuffer || !this.wasm || typeof this.wasm.malloc !== 'function') return;
    const bytes = new Uint8Array(arrayBuffer);
    const ptr = this.wasm.malloc(bytes.length);
    if (!ptr) {
      this.port.postMessage({ type: 'BANK_LOADED', ok: false });
      return;
    }
    if (this.HEAPU8.buffer !== this.wasm.memory.buffer) this._updateMemoryViews();
    this.HEAPU8.set(bytes, ptr);
    const ok = this.wasm.loadBankFromMemory(ptr, bytes.length) === 1;
    this.wasm.free(ptr);
    this.port.postMessage({ type: 'BANK_LOADED', ok, sizeBytes: bytes.length });
  }

  async initWasm(wasmBinary, sr) {
    try {
      const baseImports = {
        __cxa_throw: (ptr) => console.error('[Mcx0xWorklet] C++ exception ptr=' + ptr),
        _abort_js: () => console.error('[Mcx0xWorklet] WASM abort'),
        abort: () => console.error('[Mcx0xWorklet] WASM abort()'),
        emscripten_notify_memory_growth: () => this._updateMemoryViews(),
        emscripten_resize_heap: (requestedSize) => {
          const oldSize = this.HEAPU8 ? this.HEAPU8.length : 0;
          const pages = Math.max(1, ((requestedSize - oldSize + 65535) / 65536) | 0);
          try {
            this.wasm.memory.grow(pages);
            this._updateMemoryViews();
            return 1;
          } catch {
            return 0;
          }
        },
        clock_time_get: (_clk, _prec, ptime) => {
          if (this.wasm?.memory && ptime) {
            const ns = BigInt(Math.floor((currentTime || 0) * 1e9));
            new DataView(this.wasm.memory.buffer).setBigUint64(ptime, ns, true);
          }
          return 0;
        },
      };
      const proxy = new Proxy(baseImports, {
        get(target, prop) { return prop in target ? target[prop] : () => 0; },
      });
      const compiled = await WebAssembly.compile(wasmBinary);
      const importObj = { env: proxy, wasi_snapshot_preview1: proxy, a: proxy };
      for (const imp of WebAssembly.Module.imports(compiled)) {
        if (!(imp.module in importObj)) importObj[imp.module] = proxy;
      }
      const instance = await WebAssembly.instantiate(compiled, importObj);
      this.wasm = instance.exports;

      if (!this.wasm || !this.wasm.memory || typeof this.wasm.initEngine !== 'function') {
        throw new Error('WASM missing memory or unminified initEngine export (rebuild wasm/build_wasm.bat)');
      }

      if (typeof this.wasm.__wasm_call_ctors === 'function') this.wasm.__wasm_call_ctors();
      else if (typeof this.wasm._initialize === 'function') this.wasm._initialize();

      this._updateMemoryViews();
      this.wasm.initEngine(sr);
      this.wasm.resetToFactory();

      this.outLPtr = this.wasm.malloc(512 * 4);
      this.outRPtr = this.wasm.malloc(512 * 4);
      this.peakLPtr = this.wasm.malloc(4);
      this.peakRPtr = this.wasm.malloc(4);
      this.activeVoicesPtr = this.wasm.malloc(4);
      if (this.HEAPF32.buffer !== this.wasm.memory.buffer) this._updateMemoryViews();

      this.isReady = true;
      this.port.postMessage({ type: 'WASM_READY', sampleRate: sr });
    } catch (err) {
      this.port.postMessage({ type: 'WASM_ERROR', message: String(err?.message || err) });
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!this.isReady || !out || out.length === 0) return true;

    const outL = out[0];
    const outR = out.length > 1 ? out[1] : null;
    const n = outL.length;
    if (n <= 0 || n > 512) return true;

    this.wasm.processAudio(this.outLPtr, this.outRPtr, n);
    if (this.HEAPF32.buffer !== this.wasm.memory.buffer) this._updateMemoryViews();

    const offL = this.outLPtr >> 2;
    const offR = this.outRPtr >> 2;
    outL.set(this.HEAPF32.subarray(offL, offL + n));
    if (outR) outR.set(this.HEAPF32.subarray(offR, offR + n));

    if (++this.telemetryCounter >= 12) {
      this.telemetryCounter = 0;
      this.wasm.getAudioSnapshot(this.peakLPtr, this.peakRPtr, this.activeVoicesPtr);
      const scopeCopy = new Float32Array(n);
      scopeCopy.set(outL);
      this.port.postMessage(
        {
          type: 'TELEMETRY',
          peakL: this.HEAPF32[this.peakLPtr >> 2],
          peakR: this.HEAPF32[this.peakRPtr >> 2],
          activeVoices: this.HEAP32[this.activeVoicesPtr >> 2],
          samplesL: scopeCopy,
        },
        [scopeCopy.buffer],
      );
    }
    return true;
  }
}

registerProcessor('mcx0x-worklet-processor', Mcx0xWorkletProcessor);
