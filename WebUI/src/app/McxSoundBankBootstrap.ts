/**
 * ABDMCX0X -- McxSoundBankBootstrap.ts
 * Asynchronously registers soundbanks and streams only their manifest headers so the full
 * catalog is searchable on startup without downloading multi-megabyte WAV payloads.
 * Strictly < 200 lines.
 */

import type { McxHostBridge } from '../bridge/McxHostBridge';
import type { McxAppState } from './McxAppState';
import type { McxBankDrawer } from '../ui/McxBankDrawer';
import { ensureBankCatalogParsed, soundBankRegistry } from './McxSoundBankManager';

interface BankIndexEntry {
  id?: string;
  name: string;
  filename: string;
  author?: string;
  description?: string;
}

export async function bootstrapSoundBanks(
  bridge: McxHostBridge,
  state: McxAppState,
  bankDrawer: McxBankDrawer
): Promise<void> {
  if (bridge.isNative || typeof fetch !== 'function') return;

  try {
    const res = await fetch('/banks/index.json');
    if (!res.ok) throw new Error('No banks/index.json');
    const bankList: BankIndexEntry[] = await res.json();

    soundBankRegistry.registerBanksFromIndex(bankList);
    await Promise.all(soundBankRegistry.getBanks().map((b) => ensureBankCatalogParsed(b.id)));
    bankDrawer.setLibraryItems(soundBankRegistry.getAllCatalogItems());
    state.refs.synthModal?.refreshBrowser?.();
  } catch (err) {
    console.warn('[McxSoundBankBootstrap] Warning loading bank index:', err);
    await fallbackSingleBank(bankDrawer, state);
  }
}

async function fallbackSingleBank(
  bankDrawer: McxBankDrawer,
  state: McxAppState
): Promise<void> {
  try {
    soundBankRegistry.registerBanksFromIndex([{ id: 'roland_tr_drums', name: 'Roland TR Rhythm Sets', filename: 'Roland_TR_Drums.abdbank' }]);
    const parsed = await ensureBankCatalogParsed('roland_tr_drums');
    if (parsed && parsed.items.length > 0) {
      bankDrawer.setLibraryItems(soundBankRegistry.getAllCatalogItems());
      state.refs.synthModal?.refreshBrowser?.();
    }
  } catch (e) {
    console.warn('[McxSoundBankBootstrap] Fallback error:', e);
  }
}
