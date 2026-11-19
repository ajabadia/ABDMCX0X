/**
 * ABDMCX0X -- McxWebMidiService.ts
 * Web MIDI API hardware bridge connecting browser AudioWorklet/WASM to physical USB/DIN MIDI devices.
 * Enables real-time hardware synthesizer sequencing and clock sync. Strictly < 200 lines.
 */

export interface McxMidiDeviceDto {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export class McxWebMidiService {
  private midiAccess: any = null;
  private outputs: any[] = [];
  private inputs: any[] = [];
  private isSupported = false;
  private isInitialized = false;
  private listeners = new Set<() => void>();

  constructor() {
    this.isSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  public async init(): Promise<boolean> {
    if (!this.isSupported || this.isInitialized) return this.isInitialized;
    try {
      this.midiAccess = await (navigator as any).requestMIDIAccess({ sysex: false });
      this.isInitialized = true;
      this.refreshDevices();
      this.midiAccess.onstatechange = () => {
        this.refreshDevices();
        this.notifyListeners();
      };
      return true;
    } catch {
      this.isInitialized = false;
      return false;
    }
  }

  private refreshDevices(): void {
    if (!this.midiAccess) return;
    this.outputs = [];
    this.inputs = [];
    if (this.midiAccess.outputs) {
      for (const out of this.midiAccess.outputs.values()) {
        this.outputs.push(out);
      }
    }
    if (this.midiAccess.inputs) {
      for (const inp of this.midiAccess.inputs.values()) {
        this.inputs.push(inp);
      }
    }
  }

  public getOutputs(): McxMidiDeviceDto[] {
    return this.outputs.map((o) => ({
      id: String(o.id ?? ''),
      name: String(o.name ?? 'MIDI Output'),
      manufacturer: String(o.manufacturer ?? ''),
      state: String(o.state ?? 'connected'),
    }));
  }

  public getInputs(): McxMidiDeviceDto[] {
    return this.inputs.map((i) => ({
      id: String(i.id ?? ''),
      name: String(i.name ?? 'MIDI Input'),
      manufacturer: String(i.manufacturer ?? ''),
      state: String(i.state ?? 'connected'),
    }));
  }

  public onDeviceChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notifyListeners(): void {
    this.listeners.forEach((fn) => fn());
  }

  private getOutputForPort(portIdx: number): any | null {
    if (this.outputs.length === 0) return null;
    const clamped = Math.max(0, Math.min(portIdx, this.outputs.length - 1));
    return this.outputs[clamped] ?? null;
  }

  public sendNoteOn(portIdx: number, channel1to16: number, note: number, velocity01: number): void {
    const out = this.getOutputForPort(portIdx);
    if (!out) return;
    const ch = Math.max(0, Math.min(15, channel1to16 - 1));
    const vel = Math.max(1, Math.min(127, Math.round(velocity01 * 127)));
    try {
      out.send([0x90 | ch, Math.max(0, Math.min(127, note)), vel]);
    } catch { /* ignore dropped hardware frame */ }
  }

  public sendNoteOff(portIdx: number, channel1to16: number, note: number): void {
    const out = this.getOutputForPort(portIdx);
    if (!out) return;
    const ch = Math.max(0, Math.min(15, channel1to16 - 1));
    try {
      out.send([0x80 | ch, Math.max(0, Math.min(127, note)), 0]);
    } catch { /* ignore dropped hardware frame */ }
  }

  public sendCc(portIdx: number, channel1to16: number, cc: number, value0to127: number): void {
    const out = this.getOutputForPort(portIdx);
    if (!out) return;
    const ch = Math.max(0, Math.min(15, channel1to16 - 1));
    try {
      out.send([0xB0 | ch, Math.max(0, Math.min(127, cc)), Math.max(0, Math.min(127, value0to127))]);
    } catch { /* ignore dropped hardware frame */ }
  }

  public sendRealtime(byte: number): void {
    if (this.outputs.length === 0) return;
    for (const out of this.outputs) {
      try { out.send([byte]); } catch { /* ignore */ }
    }
  }

  public sendRawBytes(bytes: Uint8Array): void {
    let offset = 0;
    while (offset + 2 <= bytes.length) {
      const portIdx = bytes[offset++];
      const len = bytes[offset++];
      if (len > 0 && offset + len <= bytes.length) {
        const rawMsg = bytes.subarray(offset, offset + len);
        const status = rawMsg[0] ?? 0;
        if (status >= 0xF8) this.sendRealtime(status);
        else {
          const out = this.getOutputForPort(portIdx);
          if (out) {
            try { out.send(rawMsg); } catch { /* ignore */ }
          }
        }
        offset += len;
      } else {
        break;
      }
    }
  }

  public sendStart(): void { this.sendRealtime(0xFA); }
  public sendContinue(): void { this.sendRealtime(0xFB); }
  public sendStop(): void { this.sendRealtime(0xFC); }
  public sendClock(): void { this.sendRealtime(0xF8); }
}

export const webMidiService = new McxWebMidiService();
