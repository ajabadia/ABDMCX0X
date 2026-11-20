import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McxAppState } from '../app/McxAppState';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { McxPartEngineBridge } from '../bridge/McxPartEngineBridge';
import { setLocale } from '../i18n/mcxI18n';
import { areAllPinnedInBank, getBankName, hasPinnedInBank, isBankMuted, isBankSoloed } from './McxBankLayout';
import { McxBankRail } from './McxBankRail';
import { McxStepStrip } from './McxStepStrip';

function createBridgeMock() {
  return {
    isNative: true,
    loadLocalSettingsFallback: () => ({
      workingDirectory: '',
      maxPolyphony: 64,
      masterTuneHz: 440,
      standaloneBpm: 120,
    }),
    setBankLayout: vi.fn(),
    setParam: vi.fn(),
    setPartPresetName: vi.fn(),
    requestPartEngineState: vi.fn(),
  };
}

function mountMixerHarness() {
  document.body.innerHTML = `
    <div id="lcd-line1"></div>
    <div id="lcd-line2"></div>
    <section id="mcx-step-strip-host"></section>
    <aside id="mcx-bank-rail"></aside>
    <span id="mcx-active-bank-pill"></span>
    <button type="button" id="mcx-rename-bank-btn"></button>
    <button type="button" id="mcx-unpin-bank-btn" hidden></button>
    <button type="button" id="mcx-solo-clear-btn" hidden></button>
    <div class="mcx-mixer-console" id="part-list"></div>
  `;

  const bridge = createBridgeMock();
  const state = new McxAppState(bridge as unknown as McxHostBridge);
  const cbs = state.getPanelCallbacks();

  const railHost = document.getElementById('mcx-bank-rail')!;
  const stripHost = document.getElementById('mcx-step-strip-host')!;
  const unpinBtn = document.getElementById('mcx-unpin-bank-btn')!;
  const renameBtn = document.getElementById('mcx-rename-bank-btn')!;

  unpinBtn.addEventListener('click', () => state.togglePinActiveBank());
  renameBtn.addEventListener('click', () => state.openRenameBankDialog(state.bankLayout.activeBank));

  state.refs.bankRail = new McxBankRail(railHost, {
    onSelectBank: (bankIdx) => state.selectBank(bankIdx),
    onAddBank: () => state.addNewBank(),
    onDropPartOnBank: (fromBank, fromSlot, targetBank) => state.movePartSlot(fromBank, fromSlot, targetBank, -1),
    onToggleMuteBank: (bankIdx) => state.toggleLiveMuteBank(bankIdx),
    onToggleSoloBank: (bankIdx) => state.toggleLiveSoloBank(bankIdx),
    onClearAllSolos: () => state.clearAllSolos(),
    onClearAllBankMutes: () => state.clearAllBankMutes(),
    onRequestRenameBank: (bankIdx) => state.openRenameBankDialog(bankIdx),
  });

  state.refs.stepStrip = new McxStepStrip(stripHost, bridge as unknown as McxHostBridge, {
    getFocusedPart: () => state.focusedPart,
    setFocusedPart: (idx) => cbs.setFocusedPart(idx),
    getPartsState: () => state.partsState,
    getBankLayout: () => state.bankLayout,
    onToggleMute: (partIdx) => {
      cbs.onToggleMute(partIdx);
      state.refs.stepStrip?.refresh();
    },
    onToggleSolo: (partIdx) => {
      cbs.onToggleSolo(partIdx);
      state.refs.stepStrip?.refresh();
    },
    setLcdNotice: state.setLcdLine2,
  });

  state.refreshPartList();

  return {
    bridge,
    state,
    railHost,
    stripHost,
    partList: document.getElementById('part-list')!,
    pill: document.getElementById('mcx-active-bank-pill')!,
    unpinBtn,
  };
}

describe('Phase 13 Bank Rail, Pins, Live Mute & PART SOLO regressions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    setLocale('es');
  });

  it('cambia correctamente A -> B -> A -> B pulsando el rail lateral sin perder refresco del mezclador', () => {
    const { railHost, partList, pill, state } = mountMixerHarness();

    expect(pill.textContent).toBe('BANCO A');
    expect(partList.querySelector('.mcx-strip-num')?.textContent).toBe('A1');

    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.click();
    expect(state.bankLayout.activeBank).toBe(1);
    expect(pill.textContent).toBe('BANCO B');
    expect(partList.querySelector('.mcx-strip-num')?.textContent).toBe('B1');

    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="0"]')?.click();
    expect(state.bankLayout.activeBank).toBe(0);
    expect(pill.textContent).toBe('BANCO A');
    expect(partList.querySelector('.mcx-strip-num')?.textContent).toBe('A1');

    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.click();
    expect(state.bankLayout.activeBank).toBe(1);
    expect(pill.textContent).toBe('BANCO B');
    expect(partList.querySelector('.mcx-strip-num')?.textContent).toBe('B1');
  });

  it('crea Banco C al pulsar + C y activa sus 8 pistas limpias sin fijar', () => {
    const { bridge, railHost, partList, pill, state } = mountMixerHarness();

    railHost.querySelector<HTMLButtonElement>('[data-bank-add="1"]')?.click();
    expect(state.bankLayout.bankCount).toBe(3);
    expect(state.bankLayout.activeBank).toBe(2);
    expect(pill.textContent).toBe('BANCO C');
    expect(railHost.querySelectorAll('[data-bank-idx]')).toHaveLength(3);

    const nums = Array.from(partList.querySelectorAll('.mcx-strip-num')).map((el) => el.textContent);
    expect(nums).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
    expect(hasPinnedInBank(state.bankLayout, 2)).toBe(false);
    expect(partList.querySelector<HTMLButtonElement>('[data-act="move"]')?.disabled).toBe(false);
    expect(partList.querySelector<HTMLButtonElement>('[data-act="delete"]')?.disabled).toBe(false);
    expect(bridge.setParam).toHaveBeenCalledWith(16, 'partEnabled', 1);
    expect(bridge.setParam).toHaveBeenCalledWith(16, 'partMidiChannel', 1);
  });

  it('persiste Mute de grupo independiente de pistas y 2.º clic en MUTE limpia los mutes de grupo', () => {
    const { bridge, railHost, partList, state } = mountMixerHarness();

    expect(railHost.querySelectorAll('[data-bank-mute]')).toHaveLength(0);
    expect(railHost.querySelector('[data-bank-add]')).not.toBeNull();

    // Mute individual de pista A1 para comprobar que limpiar Mutes de grupo respeta el nivel pista
    partList.querySelector<HTMLButtonElement>('.mcx-strip[data-part="0"] [data-act="mute"]')?.click();
    expect(state.partsState[0].mute).toBe(true);

    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="mute"]')?.click();
    expect(railHost.querySelector('[data-bank-add]')).toBeNull();

    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="0"]')?.click();
    expect(isBankMuted(state.bankLayout, 0)).toBe(true);
    expect(railHost.querySelector('[data-bank-idx="0"]')?.classList.contains('is-muted')).toBe(true);
    expect(state.partsState[1].mute).toBe(false);
    expect(state.bankLayout.activeBank).toBe(0);
    expect(partList.querySelector('.mcx-strip[data-part="1"]')?.classList.contains('is-bank-silenced')).toBe(true);
    expect(bridge.setBankLayout).toHaveBeenCalled();

    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.click();
    expect(isBankMuted(state.bankLayout, 1)).toBe(true);
    expect(railHost.querySelector('[data-bank-idx="1"]')?.classList.contains('is-muted')).toBe(true);
    expect(state.partsState[8].mute).toBe(false);
    expect(state.bankLayout.activeBank).toBe(0);

    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="edit"]')?.click();
    expect(railHost.querySelector('[data-bank-add]')).not.toBeNull();

    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.click();
    expect(state.bankLayout.activeBank).toBe(1);
    expect(railHost.querySelector('[data-bank-idx="1"]')?.classList.contains('is-muted')).toBe(true);
    expect(partList.querySelector('.mcx-strip[data-part="8"]')?.classList.contains('is-bank-silenced')).toBe(true);

    // Entrar en MUTE y volver a pulsar MUTE (2.º clic) limpia los mutes de grupo sin tocar el mute de A1
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="mute"]')?.click();
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="mute"]')?.click();
    expect(state.bankLayout.bankMuteMask).toBe(0);
    expect(state.partsState[0].mute).toBe(true);
    expect(railHost.querySelector('[data-bank-mode="edit"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('deshabilita borrar cuando está fijada, habilita mover/borrar al desfijar y alterna Fijar/Desfijar banco', () => {
    const { bridge, partList, unpinBtn, state } = mountMixerHarness();

    const firstStrip = () => partList.querySelector<HTMLElement>('.mcx-strip[data-part="0"]')!;
    expect(firstStrip().querySelector<HTMLButtonElement>('[data-act="move"]')?.disabled).toBe(true);
    expect(firstStrip().querySelector<HTMLButtonElement>('[data-act="delete"]')?.disabled).toBe(true);
    expect(unpinBtn.hidden).toBe(false);
    expect(unpinBtn.textContent).toContain('Desfijar banco');

    firstStrip().querySelector<HTMLButtonElement>('[data-act="delete"]')?.click();
    expect(partList.querySelectorAll('.mcx-strip')).toHaveLength(8);

    firstStrip().querySelector<HTMLButtonElement>('[data-act="pin"]')?.click();
    expect(state.bankLayout.pinnedParts.has(0)).toBe(false);
    expect(firstStrip().querySelector<HTMLButtonElement>('[data-act="pin"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(firstStrip().querySelector<HTMLButtonElement>('[data-act="move"]')?.disabled).toBe(false);
    expect(firstStrip().querySelector<HTMLButtonElement>('[data-act="delete"]')?.disabled).toBe(false);

    unpinBtn.click();
    expect(hasPinnedInBank(state.bankLayout, 0)).toBe(false);
    expect(unpinBtn.textContent).toContain('Fijar banco');

    unpinBtn.click();
    expect(areAllPinnedInBank(state.bankLayout, 0)).toBe(true);
    expect(unpinBtn.textContent).toContain('Desfijar banco');

    unpinBtn.click();
    firstStrip().querySelector<HTMLButtonElement>('[data-act="delete"]')?.click();
    expect(partList.querySelectorAll('.mcx-strip')).toHaveLength(7);
    expect(partList.querySelectorAll('.mcx-strip-empty')).toHaveLength(1);
    expect(partList.querySelector('[data-act="add-part"]')?.textContent).toContain('Añadir parte');
    expect(bridge.setParam).toHaveBeenCalledWith(0, 'partEnabled', 0);
  });

  it('añade PART SOLO junto a PART MUTE en la tira superior, permite múltiples SOLO y desmutea al activar SOLO', () => {
    const { bridge, stripHost, state } = mountMixerHarness();

    const modeIds = Array.from(stripHost.querySelectorAll<HTMLElement>('[data-step-mode]')).map(
      (btn) => btn.dataset.stepMode,
    );
    expect(modeIds.slice(0, 3)).toEqual(['part-select', 'part-mute', 'part-solo']);

    // Mutear P1 antes de activarle SOLO -> activar SOLO debe desmutearla
    stripHost.querySelector<HTMLButtonElement>('[data-step-mode="part-mute"]')?.click();
    stripHost.querySelector<HTMLButtonElement>('.abd-step-pad__btn[data-pad="1"]')?.click();
    expect(state.partsState[0].mute).toBe(true);

    stripHost.querySelector<HTMLButtonElement>('[data-step-mode="part-solo"]')?.click();

    const pad1 = stripHost.querySelector<HTMLButtonElement>('.abd-step-pad__btn[data-pad="1"]')!;
    const pad10 = stripHost.querySelector<HTMLButtonElement>('.abd-step-pad__btn[data-pad="10"]')!;
    const pad2 = stripHost.querySelector<HTMLButtonElement>('.abd-step-pad__btn[data-pad="2"]')!;

    pad1.click();
    pad10.click();

    expect(state.partsState[0].solo).toBe(true);
    expect(state.partsState[0].mute).toBe(false);
    expect(bridge.setParam).toHaveBeenCalledWith(0, 'partMute', 0);
    expect(state.partsState[9].solo).toBe(true);
    expect(state.partsState[1].solo).toBe(false);
    expect(state.partsState[1].mute).toBe(false);
    expect(pad1.classList.contains('is-solo')).toBe(true);
    expect(pad10.classList.contains('is-solo')).toBe(true);
    expect(pad2.classList.contains('is-muted')).toBe(true);
    expect(document.getElementById('mcx-solo-clear-btn')?.hidden).toBe(false);
  });

  it('no re-solicita estado ni reconstruye el DOM ante applyRemoteState sin cambios y responde al clic en <span> de Desfijar banco', () => {
    const { bridge, railHost, partList, unpinBtn, state } = mountMixerHarness();

    const partBridge = new McxPartEngineBridge({
      partIndex: 0,
      hostBridge: bridge as unknown as McxHostBridge,
      getPartState: () => state.partsState[0],
      getCatalog: () => [],
      getPartPresets: () => undefined,
      onHostStateChanged: () => state.notifyPartMetadataChanged(0),
    });

    const initialName = state.partsState[0].name;
    const bankABtnBefore = railHost.querySelector('[data-bank-idx="0"]');
    const firstStripBefore = partList.querySelector('.mcx-strip[data-part="0"]');

    partBridge.applyRemoteState('structured_rompler', JSON.stringify({ 'mode.drum': 0 }), initialName);
    partBridge.applyRemoteState('structured_rompler', JSON.stringify({ 'mode.drum': 0 }), initialName);

    expect(bridge.requestPartEngineState).not.toHaveBeenCalled();
    expect(railHost.querySelector('[data-bank-idx="0"]')).toBe(bankABtnBefore);
    expect(partList.querySelector('.mcx-strip[data-part="0"]')).toBe(firstStripBefore);

    partBridge.applyRemoteState('structured_rompler', JSON.stringify({ 'mode.drum': 0 }), 'Updated Preset');
    expect(state.partsState[0].name).toBe('Updated Preset');
    expect(bridge.requestPartEngineState).not.toHaveBeenCalled();

    const unpinSpan = unpinBtn.querySelector('span');
    expect(unpinSpan?.textContent).toBe('Desfijar banco');
    unpinSpan?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(hasPinnedInBank(state.bankLayout, 0)).toBe(false);
    expect(unpinBtn.textContent).toContain('Fijar banco');
  });

  it('monta la tira de 16 pads a la izquierda y los 6 modos en matriz de 2 filas a la derecha sin cabecera MODE', () => {
    const { stripHost } = mountMixerHarness();

    expect(stripHost.classList.contains('abd-step-strip--modes-right')).toBe(true);
    expect(stripHost.querySelector('.abd-step-strip__module-header')).toBeNull();
    const grid = stripHost.querySelector<HTMLElement>('.abd-step-strip__modes-grid.is-matrix');
    expect(grid).not.toBeNull();
    expect(grid?.style.getPropertyValue('--mode-rows')).toBe('2');
    expect(grid?.style.getPropertyValue('--mode-cols')).toBe('3');
    expect(grid?.querySelectorAll('[data-step-mode]')).toHaveLength(6);

    const children = Array.from(stripHost.children);
    expect(children[0]?.classList.contains('abd-step-strip__pads')).toBe(true);
    expect(children[1]?.classList.contains('abd-step-strip__left')).toBe(true);
  });

  it('aplica jerarquía DAW de 2 niveles (Solo grupo respeta Mute hijo, Solo hijo vence bus muteado) y 2.º clic en SOLO restaura todo', () => {
    const { bridge, railHost, partList, state } = mountMixerHarness();

    // Regla 1 (Mismo nivel Grupo): Mutear Banco B y luego activar SOLO al Banco B -> se desmutea el grupo y 2.º clic en SOLO restaura su mute
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="mute"]')?.click();
    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.click();
    expect(isBankMuted(state.bankLayout, 1)).toBe(true);

    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="solo"]')?.click();
    expect(railHost.querySelector('[data-bank-add]')).toBeNull();
    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.click();
    expect(state.bankLayout.activeBank).toBe(0);
    expect(isBankSoloed(state.bankLayout, 1)).toBe(true);
    expect(isBankMuted(state.bankLayout, 1)).toBe(false);
    expect(railHost.querySelector('[data-bank-idx="1"]')?.classList.contains('is-solo')).toBe(true);
    expect(railHost.querySelector('[data-bank-idx="0"]')?.classList.contains('is-solo-silenced')).toBe(true);
    expect(document.getElementById('mcx-solo-clear-btn')?.hidden).toBe(false);

    // 2.º clic en el botón SOLO superior limpia todos los solos y restaura el mute previo de Banco B
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="solo"]')?.click();
    expect(isBankSoloed(state.bankLayout, 1)).toBe(false);
    expect(isBankMuted(state.bankLayout, 1)).toBe(true);
    expect(document.getElementById('mcx-solo-clear-btn')?.hidden).toBe(true);
    expect(state.refs.bankRail?.getMode()).toBe('edit');

    // Limpiar mute del Banco B y probar Regla 2: pista hija muteada permanece en Mute aunque su grupo pase a Solo
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="mute"]')?.click();
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="mute"]')?.click();
    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.click(); // Ver Banco B
    partList.querySelector<HTMLButtonElement>('.mcx-strip[data-part="9"] [data-act="mute"]')?.click(); // B2 Mute
    expect(state.partsState[9].mute).toBe(true);

    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="solo"]')?.click();
    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.click(); // Solo Banco B
    expect(isBankSoloed(state.bankLayout, 1)).toBe(true);
    expect(state.partsState[9].mute).toBe(true);
    expect(partList.querySelector('.mcx-strip[data-part="9"]')?.classList.contains('is-muted')).toBe(true);
    expect(partList.querySelector('.mcx-strip[data-part="8"]')?.classList.contains('is-bank-silenced')).toBe(false);

    // Quitar solo del grupo y probar Regla 3 y 4: grupo B muteado + B2 muteada -> Solo en B2 desmutea solo B2 y pasa por el bus muteado
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="solo"]')?.click();
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="mute"]')?.click();
    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.click(); // Mute Banco B (B1..B8 silenciadas)
    expect(isBankMuted(state.bankLayout, 1)).toBe(true);

    partList.querySelector<HTMLButtonElement>('.mcx-strip[data-part="9"] [data-act="solo"]')?.click();
    expect(state.partsState[9].solo).toBe(true);
    expect(state.partsState[9].mute).toBe(false);
    expect(isBankMuted(state.bankLayout, 1)).toBe(true);
    expect(bridge.setParam).toHaveBeenCalledWith(9, 'partMute', 0);
    expect(partList.querySelector('.mcx-strip[data-part="9"] [data-act="solo"]')?.classList.contains('is-solo')).toBe(true);
    expect(partList.querySelector('.mcx-strip[data-part="9"]')?.classList.contains('is-bank-silenced')).toBe(false);
    expect(partList.querySelector('.mcx-strip[data-part="8"]')?.classList.contains('is-bank-silenced')).toBe(true);

    // 2.º clic en SOLO restaura Mute tanto de B2 como del Banco B
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="solo"]')?.click();
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="solo"]')?.click();
    expect(state.partsState[9].solo).toBe(false);
    expect(state.partsState[9].mute).toBe(true);
    expect(isBankMuted(state.bankLayout, 1)).toBe(true);
    expect(document.getElementById('mcx-solo-clear-btn')?.hidden).toBe(true);
  });

  it('abre modal nativa <dialog> para renombrar grupos con chips, limpiar o cancelar y persiste en bankLayout JSON', () => {
    const { bridge, railHost, state } = mountMixerHarness();

    const renameBtn = document.getElementById('mcx-rename-bank-btn')!;
    expect(renameBtn.textContent).toContain('Renombrar');

    renameBtn.click();
    const dlgA = document.querySelector<HTMLDialogElement>('dialog.mcx-rename-bank-dialog')!;
    expect(dlgA).not.toBeNull();
    expect(dlgA.getAttribute('closedby')).toBe('any');
    expect(dlgA.getAttribute('aria-labelledby')).toBe('mcx-rename-bank-title');
    expect(dlgA.getAttribute('role')).toBeNull();
    expect(dlgA.getAttribute('aria-modal')).toBeNull();

    const inputA = dlgA.querySelector<HTMLInputElement>('#mcx-rename-bank-input')!;
    inputA.value = '  Drums A  ';
    dlgA.querySelector<HTMLButtonElement>('button[value="save"]')?.click();

    expect(document.querySelector('dialog.mcx-rename-bank-dialog')).toBeNull();
    expect(getBankName(state.bankLayout, 0)).toBe('Drums A');
    expect(document.getElementById('mcx-active-bank-pill')?.textContent).toBe('BANCO A · Drums A');
    expect(railHost.querySelector('[data-bank-idx="0"]')?.textContent).toContain('Drums A');
    const lastJsonCall = bridge.setBankLayout.mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(lastJsonCall).bankNames).toEqual(['Drums A', '']);

    // Cancelar conserva el nombre actual sin cambios
    renameBtn.click();
    const dlgCancel = document.querySelector<HTMLDialogElement>('dialog.mcx-rename-bank-dialog')!;
    dlgCancel.querySelector<HTMLInputElement>('#mcx-rename-bank-input')!.value = 'Descartado';
    dlgCancel.querySelector<HTMLButtonElement>('button[value="cancel"]')?.click();
    expect(getBankName(state.bankLayout, 0)).toBe('Drums A');

    // Doble clic en Banco B abre la modal para B sin cambiar el banco activo (A), permite chip y Quitar nombre
    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const dlgB = document.querySelector<HTMLDialogElement>('dialog.mcx-rename-bank-dialog')!;
    dlgB.querySelector<HTMLButtonElement>('[data-rename-chip="Bass"]')?.click();
    expect(dlgB.querySelector<HTMLInputElement>('#mcx-rename-bank-input')?.value).toBe('Bass');
    dlgB.querySelector<HTMLButtonElement>('button[value="save"]')?.click();

    expect(state.bankLayout.activeBank).toBe(0);
    expect(getBankName(state.bankLayout, 1)).toBe('Bass');
    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.click();
    expect(document.getElementById('mcx-active-bank-pill')?.textContent).toBe('BANCO B · Bass');

    // Quitar nombre deja el banco solo con su letra
    renameBtn.click();
    document.querySelector<HTMLButtonElement>('dialog.mcx-rename-bank-dialog button[value="clear"]')?.click();
    expect(getBankName(state.bankLayout, 1)).toBe('');
    expect(document.getElementById('mcx-active-bank-pill')?.textContent).toBe('BANCO B');
  });
});
