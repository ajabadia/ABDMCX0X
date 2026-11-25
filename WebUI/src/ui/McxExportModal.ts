/**
 * ABDMCX0X -- McxExportModal.ts
 * Standard Export Dialog: SMF Type 1 (.mid), Drag-to-DAW MIDI, & Offline WAV Bounce.
 * Strict line limit: < 200 lines. 100% CSS tokens.
 */

import { attachDialogDrag, bringToFront } from '@abdsynths/shared/diagnostic-probe/DiagnosticProbeI18n.js';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import type { McxAppState } from '../app/McxAppState';
import type { McxSongScenesStateDto } from '../bridge/McxSongBridge';
import { getLocale } from '../i18n/mcxI18n';
import { exportProjectToMidi, makeMidiDataUrl } from '../export/McxMidiExporter';
import { encodeStereoWavPcm16, saveOrDownloadExportFile, triggerBrowserDownload } from '../export/McxWavExporter';

const SVG_DRAG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
const SVG_CLOSE = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

export interface McxExportModalOptions {
  bridge: McxHostBridge;
  state: McxAppState;
  getSongState: () => McxSongScenesStateDto | null;
}

export class McxExportModal {
  private readonly opts: McxExportModalOptions;
  private el: HTMLDialogElement;
  private statusMsg = '';

  constructor(opts: McxExportModalOptions) {
    this.opts = opts;
    this.el = document.createElement('dialog');
    this.el.className = 'mcx-export-dialog';
    this.el.setAttribute('aria-label', 'Export MIDI & Audio');
    document.body.appendChild(this.el);
    opts.bridge.onExportComplete((dto) => {
      this.setStatus(dto.ok ? `Exported ${dto.kind}${dto.count ? ` (${dto.count} files)` : ''}` : 'Export cancelled / failed');
    });
  }

  public open(): void {
    this.render();
    if (!this.el.open) { if (typeof this.el.showModal === 'function') this.el.showModal(); else this.el.setAttribute('open', ''); }
    bringToFront(this.el);
  }
  public close(): void { if (this.el.open) { this.el.close?.(); this.el.removeAttribute('open'); } }
  public setStatus(msg: string): void { this.statusMsg = msg; const s = this.el.querySelector('#mcx-exp-status'); if (s) s.textContent = msg; }

  private buildMidiBytes(): { bytes: Uint8Array; filename: string } {
    const scopeSel = this.el.querySelector<HTMLSelectElement>('#mcx-exp-midi-scope')?.value || 'pattern_all';
    const { partsState, focusedPart, globalSettings } = this.opts.state;
    const songState = this.opts.getSongState();
    const bpm = globalSettings?.standaloneBpm || 120;
    if (scopeSel === 'part') {
      return {
        bytes: exportProjectToMidi(partsState, songState, bpm, 'pattern', focusedPart),
        filename: `ABDMCX0X_Part${String(focusedPart + 1).padStart(2, '0')}.mid`,
      };
    }
    const mode = scopeSel === 'song' ? 'song' : 'pattern';
    return {
      bytes: exportProjectToMidi(partsState, songState, bpm, mode),
      filename: mode === 'song' ? 'ABDMCX0X_Song.mid' : 'ABDMCX0X_Pattern.mid',
    };
  }

  private render(): void {
    const isEs = getLocale() === 'es';
    const { state } = this.opts;
    this.el.innerHTML = `
      <div class="mcx-export-card">
        <header class="mcx-export-head">
          <div class="mcx-export-title-wrap">
            <span class="mcx-export-badge">EXPORT</span>
            <h3 class="mcx-export-title">${isEs ? 'EXPORTAR MIDI / AUDIO WAV' : 'EXPORT MIDI / WAV AUDIO'}</h3>
          </div>
          <button type="button" class="mcx-drawer-close-btn" id="mcx-exp-close">${SVG_CLOSE}</button>
        </header>
        <section class="mcx-export-section">
          <div class="mcx-export-sec-title">STANDARD MIDI FILE (.mid · SMF Type 1)</div>
          <div class="mcx-export-row">
            <select class="mcx-export-select" id="mcx-exp-midi-scope">
              <option value="part">${isEs ? `Solo Parte P${String(state.focusedPart + 1).padStart(2, '0')}` : `Focused Part P${String(state.focusedPart + 1).padStart(2, '0')}`}</option>
              <option value="pattern_all" selected>${isEs ? 'Patrón Activo (Multipista)' : 'Active Pattern (Multi-Track)'}</option>
              <option value="song">${isEs ? 'Canción Completa (Song Unroll)' : 'Full Song Arrangement'}</option>
            </select>
            <button type="button" class="mcx-export-btn is-accent" id="mcx-exp-midi-btn">${isEs ? 'Exportar .mid' : 'Export .mid'}</button>
            <span class="mcx-export-drag-pill" id="mcx-exp-midi-drag" draggable="true" title="${isEs ? 'Arrastra hacia tu DAW' : 'Drag into your DAW'}">${SVG_DRAG} DRAG TO DAW</span>
          </div>
        </section>
        <section class="mcx-export-section">
          <div class="mcx-export-sec-title">OFFLINE AUDIO BOUNCE (.wav · 16-bit Stereo)</div>
          <div class="mcx-export-row">
            <select class="mcx-export-select" id="mcx-exp-wav-scope">
              <option value="master">Master Mix (Stereo)</option>
              <option value="part">${isEs ? `Parte P${String(state.focusedPart + 1).padStart(2, '0')}` : `Part P${String(state.focusedPart + 1).padStart(2, '0')}`}</option>
              <option value="bank">${isEs ? `Banco Activo (${String.fromCharCode(65 + state.bankLayout.activeBank)})` : `Active Bank (${String.fromCharCode(65 + state.bankLayout.activeBank)})`}</option>
              <option value="stems">${isEs ? 'Stems Separados (Partes activas)' : 'Individual Part Stems'}</option>
            </select>
            <label class="mcx-export-lbl">BARS <input type="number" class="mcx-export-num" id="mcx-exp-bars" min="1" max="32" value="4"/></label>
            <label class="mcx-export-lbl">TAIL(s) <input type="number" class="mcx-export-num" id="mcx-exp-tail" min="0" max="8" step="0.5" value="1.5"/></label>
          </div>
          <div class="mcx-export-row">
            <label class="mcx-export-check"><input type="checkbox" id="mcx-exp-use-song"/> ${isEs ? 'Seguir Arrangement Song Mode' : 'Render Song Arrangement'}</label>
            <button type="button" class="mcx-export-btn is-accent" id="mcx-exp-wav-btn">${isEs ? 'Renderizar .wav' : 'Bounce .wav'}</button>
          </div>
        </section>
        <footer class="mcx-export-foot"><span id="mcx-exp-status">${this.statusMsg || (isEs ? 'Listo para exportar' : 'Ready to export')}</span></footer>
      </div>`;

    const head = this.el.querySelector<HTMLElement>('.mcx-export-head');
    if (head) attachDialogDrag(this.el, head);
    this.el.querySelector('#mcx-exp-close')?.addEventListener('click', () => this.close());
    this.el.querySelector('#mcx-exp-midi-btn')?.addEventListener('click', () => {
      const { bytes, filename } = this.buildMidiBytes();
      saveOrDownloadExportFile(this.opts.bridge, bytes, 'midi', 'mid', filename);
      this.setStatus(`MIDI ready: ${filename}`);
    });
    const dragEl = this.el.querySelector<HTMLElement>('#mcx-exp-midi-drag');
    dragEl?.addEventListener('dragstart', (ev) => {
      const { bytes, filename } = this.buildMidiBytes();
      const url = makeMidiDataUrl(bytes);
      ev.dataTransfer?.setData('DownloadURL', `audio/midi:${filename}:${url}`);
      ev.dataTransfer?.setData('text/uri-list', url);
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
    });
    this.el.querySelector('#mcx-exp-wav-btn')?.addEventListener('click', () => { void this.runWavBounce(); });
  }

  private async runWavBounce(): Promise<void> {
    const scope = (this.el.querySelector<HTMLSelectElement>('#mcx-exp-wav-scope')?.value || 'master') as 'master' | 'part' | 'bank' | 'stems';
    const bars = Math.max(1, Math.min(32, Number(this.el.querySelector<HTMLInputElement>('#mcx-exp-bars')?.value || 4)));
    const tailSec = Math.max(0, Math.min(8, Number(this.el.querySelector<HTMLInputElement>('#mcx-exp-tail')?.value || 1.5)));
    const useSongMode = Boolean(this.el.querySelector<HTMLInputElement>('#mcx-exp-use-song')?.checked);
    const { bridge, state } = this.opts;

    if (bridge.isNative) {
      this.setStatus('Rendering offline WAV in C++...');
      await bridge.renderWavOffline({ scope, part: state.focusedPart, bank: state.bankLayout.activeBank, bars, tailSec, useSongMode });
      return;
    }

    if (scope === 'stems') {
      const activeParts = state.partsState.map((p, i) => ({ i, p })).filter((x) => x.p.enabled !== false);
      let count = 0;
      for (const { i, p } of activeParts) {
        this.setStatus(`Bouncing Stem P${String(i + 1).padStart(2, '0')} (${count + 1}/${activeParts.length})...`);
        const res = await bridge.renderWavOffline({ scope: 'part', part: i, bars, tailSec, useSongMode });
        if (res?.ok && res.left.length > 0) {
          const clean = (p.name || `Part${i + 1}`).replace(/[^a-zA-Z0-9_-]+/g, '_');
          triggerBrowserDownload(encodeStereoWavPcm16(res.left, res.right, res.sampleRate), `Part_${String(i + 1).padStart(2, '0')}_${clean}.wav`, 'audio/wav');
          count++;
        }
      }
      this.setStatus(`Stems bounced (${count} WAV files)`);
      return;
    }

    this.setStatus('Bouncing offline WAV...');
    const res = await bridge.renderWavOffline({ scope, part: state.focusedPart, bank: state.bankLayout.activeBank, bars, tailSec, useSongMode });
    if (!res?.ok || res.left.length === 0) { this.setStatus('Bounce failed'); return; }
    const wav = encodeStereoWavPcm16(res.left, res.right, res.sampleRate);
    triggerBrowserDownload(wav, `ABDMCX0X_${scope}.wav`, 'audio/wav');
    this.setStatus(`WAV exported (${(res.left.length / res.sampleRate).toFixed(1)}s)`);
  }
}
