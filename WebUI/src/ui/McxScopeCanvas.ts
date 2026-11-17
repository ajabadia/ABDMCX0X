/**
 * ABDMCX0X -- McxScopeCanvas.ts
 * Live high-DPI Oscilloscope + Stereo Peak VU visualizer driven by WASM / SPSC telemetry.
 */

import type { McxTelemetry } from '../bridge/BridgeWasm';

export class McxScopeCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastSamples: Float32Array = new Float32Array(128);
  private peakL = 0;
  private peakR = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.draw();
  }

  public pushTelemetry(tel: McxTelemetry): void {
    if (tel.samplesL && tel.samplesL.length > 0) {
      this.lastSamples = tel.samplesL;
    }
    this.peakL = Math.max(tel.peakL, this.peakL * 0.82);
    this.peakR = Math.max(tel.peakR, this.peakR * 0.82);
    this.draw();
  }

  public draw(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = this.canvas.clientWidth || 240;
    const cssH = this.canvas.clientHeight || 44;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    const styles = getComputedStyle(document.documentElement);
    const tok = (name: string) => styles.getPropertyValue(name).trim();
    const bg = tok('--color-lcd-bg');
    const trace = tok('--color-lcd-text');
    const border = tok('--color-lcd-border');
    const accent = tok('--color-accent');
    const danger = tok('--color-danger');
    const vuTrack = tok('--color-panel-surface');

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Background + subtle graticule tinted by active theme token
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    const vuWidth = 22;
    const scopeW = cssW - vuWidth - 6;
    const midY = cssH * 0.5;

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(scopeW, midY);
    ctx.stroke();
    ctx.restore();

    // Rising zero-crossing trigger for stable waveform lock
    const buf = this.lastSamples;
    let start = 0;
    const half = Math.floor(buf.length * 0.5);
    for (let i = 1; i < half; ++i) {
      if (buf[i - 1] <= 0 && buf[i] > 0) {
        start = i;
        break;
      }
    }
    const drawLen = Math.max(16, buf.length - start);

    // Waveform phosphor trace
    ctx.strokeStyle = trace;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = trace;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    for (let i = 0; i < drawLen; ++i) {
      const x = (i / (drawLen - 1)) * scopeW;
      const y = midY - Math.max(-1, Math.min(1, buf[start + i])) * (cssH * 0.42);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Stereo L/R Peak VU bars
    const barX = scopeW + 6;
    const drawBar = (x: number, peak: number) => {
      const clamped = Math.max(0, Math.min(1, peak));
      const barH = Math.round(clamped * (cssH - 6));
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = vuTrack;
      ctx.fillRect(x, 3, 7, cssH - 6);
      ctx.restore();
      ctx.fillStyle = clamped > 0.92 ? danger : accent;
      ctx.fillRect(x, cssH - 3 - barH, 7, barH);
    };
    drawBar(barX, this.peakL);
    drawBar(barX + 10, this.peakR);

    ctx.restore();
  }
}
