/**
 * ABDMCX0X — WebUI main.ts
 * Integración de UI para el Groove-Rompler y Controlador Hardware
 */

import { PARAM_DEFINITIONS } from './generated/parameters.gen';

interface BridgeMessage {
  type: string;
  [key: string]: unknown;
}

class McxBridge {
  private isNative = false;

  constructor() {
    this.isNative = !!(window as any).chrome?.webview;
    if (this.isNative) {
      (window as any).chrome.webview.addEventListener('message', (event: any) => {
        this.onMessage(event.data);
      });
    }
  }

  send(msg: BridgeMessage) {
    if (this.isNative) {
      (window as any).chrome.webview.postMessage(msg);
    } else {
      console.log('[WASM/Mock Bridge]', msg);
    }
  }

  onMessage(data: any) {
    if (data?.type === 'telemetry') {
      const el = document.getElementById('voice-counter');
      if (el) el.innerText = `${data.activeVoices} Voices`;
    }
  }

  notifyReady() {
    this.send({ type: 'uiReady' });
  }
}

const bridge = new McxBridge();

function initPartMixer() {
  const container = document.getElementById('part-list');
  if (!container) return;

  for (let i = 0; i < 16; ++i) {
    const isDrum = (i === 9);
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 8px; margin-bottom: 4px; background: rgba(255,255,255,0.03);
      border-radius: 4px; font-size: 11px; cursor: pointer;
    `;
    row.innerHTML = `
      <span><strong>P${i + 1}</strong> ${isDrum ? 'DRUM KIT' : 'Synth ' + (i + 1)}</span>
      <span style="color: #888;">INT</span>
    `;
    row.addEventListener('click', () => {
      bridge.send({ type: 'setParam', id: 'focusedPartIndex', value: i });
      const label = document.getElementById('focused-part-label');
      if (label) label.innerText = `Part ${i + 1}: ${isDrum ? 'Drum Kit' : 'Melodic Synth'}`;
    });
    container.appendChild(row);
  }
}

function initDeckControls() {
  const container = document.getElementById('nuke-controls');
  if (!container) return;

  const deckParams = [
    { id: 'tvfCutoffOffset', label: 'CUTOFF' },
    { id: 'tvfResonanceOffset', label: 'RESO' },
    { id: 'envAttackOffset', label: 'ATTACK' },
    { id: 'envReleaseOffset', label: 'RELEASE' }
  ];

  deckParams.forEach(p => {
    const box = document.createElement('div');
    box.style.cssText = `
      background: rgba(0,0,0,0.3); border: 1px solid #333; border-radius: 6px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 12px; gap: 6px;
    `;
    box.innerHTML = `
      <div style="font-size: 10px; font-weight: bold; color: #aaa;">${p.label}</div>
      <input type="range" min="-50" max="50" value="0" style="width: 80%; cursor: pointer;" />
      <div class="val" style="font-size: 11px; color: #00d2ff;">0</div>
    `;
    const input = box.querySelector('input')!;
    const valEl = box.querySelector('.val')!;
    input.addEventListener('input', () => {
      valEl.textContent = input.value;
      bridge.send({ type: 'setParam', id: p.id, value: parseFloat(input.value) });
    });
    container.appendChild(box);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initPartMixer();
  initDeckControls();
  bridge.notifyReady();
});
