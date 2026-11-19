/**
 * ABDMCX0X — McxDefaultCatalog.ts
 * Initial factory library catalog items for the ABDMCX0X Bank Drawer.
 */

import type { McxCatalogItem } from './McxBankDrawer';

export function getDefaultFactoryItems(): McxCatalogItem[] {
  return [
    { id: 'f_piano01', name: 'Acoustic Piano 1', categoryName: 'Keys / Organ', categoryId: 5, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland', factoryPresetIndex: 4 },
    { id: 'f_piano02', name: 'Bright Piano', categoryName: 'Keys / Organ', categoryId: 5, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland', factoryPresetIndex: 5 },
    { id: 'f_ep01', name: 'Vintage Rhodes EP', categoryName: 'Keys / Organ', categoryId: 5, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland', factoryPresetIndex: 11 },
    { id: 'f_strings01', name: 'Silk Warm Strings', categoryName: 'Strings / Solo', categoryId: 1, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland', factoryPresetIndex: 10 },
    { id: 'f_bass01', name: 'Acid TB-303 Square', categoryName: 'Bass / Pluck', categoryId: 3, engineKind: 'virtual_analog', sublibrary: 'Factory Roland', factoryPresetIndex: 0 },
    { id: 'f_bass02', name: 'Acid TB-303 Saw', categoryName: 'Bass / Pluck', categoryId: 3, engineKind: 'virtual_analog', sublibrary: 'Factory Roland', factoryPresetIndex: 6 },
    { id: 'f_bass03', name: 'Slap Bass Fingered', categoryName: 'Bass / Pluck', categoryId: 3, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland', factoryPresetIndex: 13 },
    { id: 'f_pad01', name: 'Solar Ambient Pad', categoryName: 'Pads / Showcase', categoryId: 4, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland', factoryPresetIndex: 14 },
    { id: 'f_drum01', name: 'TR-909 Dance Kit', categoryName: 'Rhythm / Drums', categoryId: 9, engineKind: 'rompler_drum_map', sublibrary: 'Factory Roland', factoryPresetIndex: 16 },
    { id: 'f_drum02', name: 'TR-808 Electro Kit', categoryName: 'Rhythm / Drums', categoryId: 9, engineKind: 'rompler_drum_map', sublibrary: 'Factory Roland', factoryPresetIndex: 17 },
    { id: 'f_drum03', name: 'Boss DR-5 Standard', categoryName: 'Rhythm / Drums', categoryId: 9, engineKind: 'rompler_drum_map', sublibrary: 'Factory Boss', factoryPresetIndex: 18 },
  ];
}
