/**
 * ABDMCX0X -- McxNavbarMenus.ts
 * Desktop menu bar definition for McxNavbar (File / Edit / Tools / Help).
 * Strict line limit: < 120 lines.
 */

import { THEME_FAMILIES } from './ThemeManager';

export function buildMcxNavbarMenus() {
  return [
    {
      name: 'File', nameEs: 'Archivo', items: [
        { id: 90, label: 'New Project', labelEs: 'Nuevo Proyecto', action: 'newProject', shortcut: 'Ctrl+N' },
        {
          id: 91, label: 'New From Template...', labelEs: 'Nuevo desde Plantilla...', submenu: [
            { id: 910, label: 'Empty (Clean Slate)', labelEs: 'Vacío (Desde Cero)', action: 'template', value: 'empty' },
            { id: 911, label: 'Factory Demo (MC-303)', labelEs: 'Demo de Fábrica (MC-303)', action: 'template', value: 'factory' },
            { id: 912, label: 'Basic 8-Track Starter', labelEs: 'Iniciador 8 Pistas Básico', action: 'template', value: 'starter8' },
            { id: 913, label: 'Electronic / Synthwave', labelEs: 'Electrónica / Synthwave', action: 'template', value: 'electronic' },
            { id: 914, label: 'Live Performance 64P', labelEs: 'Directo 64P (MIDI Externo)', action: 'template', value: 'live64' },
          ],
        },
        { separator: true },
        { id: 92, label: 'Open Project (.mcxprj)...', labelEs: 'Abrir Proyecto (.mcxprj)...', action: 'openProject', shortcut: 'Ctrl+O' },
        { id: 93, label: 'Save Project (.mcxprj)', labelEs: 'Guardar Proyecto (.mcxprj)', action: 'saveProject', shortcut: 'Ctrl+S' },
        { id: 94, label: 'Save Project As...', labelEs: 'Guardar Proyecto Como...', action: 'saveProjectAs', shortcut: 'Ctrl+Shift+S' },
        { separator: true },
        { id: 106, label: 'Export MIDI / WAV Audio...', labelEs: 'Exportar MIDI / Audio WAV...', action: 'openExport', shortcut: 'Ctrl+E' },
        { id: 100, label: 'Configure Working Folder...', labelEs: 'Configurar Directorio de Trabajo...', action: 'configureFolder' },
        { separator: true },
        { id: 102, label: 'Factory Preset Reset', labelEs: 'Restablecer Fábrica', action: 'factoryReset' },
      ],
    },
    {
      name: 'Edit', nameEs: 'Edición',
      items: [
        { id: 210, label: 'Undo', labelEs: 'Deshacer', action: 'undo', shortcut: 'Ctrl+Z' },
        { id: 211, label: 'Redo', labelEs: 'Rehacer', action: 'redo', shortcut: 'Ctrl+Y' },
        { id: 212, label: 'Compare A/B', labelEs: 'Comparar A/B', action: 'toggleCompare', shortcut: 'Ctrl+Shift+B' },
        { id: 213, label: 'Capture Compare Baseline (A)', labelEs: 'Fijar Referencia Compare (A)', action: 'captureCompare' },
        { separator: true },
        { id: 200, label: 'Global Settings...', labelEs: 'Ajustes Globales...', action: 'openSettings', shortcut: 'Ctrl+,' },
        { id: 201, label: 'All Notes Off (Panic)', labelEs: 'Silenciar Todo (Pánico)', action: 'panic', shortcut: 'Esc' },
        { separator: true },
        {
          id: 203, label: 'Visual Theme', labelEs: 'Tema Visual',
          submenu: [
            { id: 220, label: 'Toggle Light / Dark', labelEs: 'Cambiar Claro / Oscuro', action: 'toggleScheme' },
            { separator: true },
            ...THEME_FAMILIES.map((f, idx) => ({
              id: 221 + idx, label: f.label, labelEs: f.label, action: 'themeFamily', value: f.key,
            })),
          ],
        },
        {
          id: 204, label: 'Language', labelEs: 'Idioma',
          submenu: [
            { id: 241, label: 'Español (ES)', labelEs: 'Español (ES)', action: 'locale', value: 'es' },
            { id: 242, label: 'English (EN)', labelEs: 'English (EN)', action: 'locale', value: 'en' },
          ],
        },
      ],
    },
    {
      name: 'Tools', nameEs: 'Herramientas',
      items: [
        { id: 300, label: 'Master Multi-Bus FX Rack...', labelEs: 'Rack Multibus de Efectos...', action: 'openFxRack', shortcut: 'Ctrl+F' },
        { id: 302, label: 'Master Global LFOs...', labelEs: 'LFOs Globales (Master)...', action: 'openGlobalLfo', shortcut: 'Ctrl+L' },
        { id: 303, label: 'Piano Roll Sequencer...', labelEs: 'Secuenciador Rollo Pianola...', action: 'openPianoRoll', shortcut: 'Ctrl+P' },
        { id: 304, label: 'Master Groove & Shuffle...', labelEs: 'Groove y Shuffle Maestro...', action: 'openGroove', shortcut: 'Ctrl+G' },
        { id: 305, label: 'Song Mode & Live Scenes...', labelEs: 'Modo Canción y Escenas...', action: 'openSong', shortcut: 'Ctrl+M' },
        { id: 306, label: 'MIDI Learn Matrix...', labelEs: 'Matriz MIDI Learn...', action: 'openMidiLearn' },
        { id: 307, label: 'Performance Deck...', labelEs: 'Superficie Performance...', action: 'openPerformance', shortcut: 'Ctrl+K' },
        { id: 301, label: '440 Hz Signal Probe...', labelEs: 'Sonda de Señal 440 Hz...', action: 'toggleProbe', shortcut: 'Ctrl+4' },
      ],
    },
    {
      name: 'Help', nameEs: 'Ayuda',
      items: [
        { id: 901, label: 'Check for Updates...', labelEs: 'Buscar Actualizaciones...', action: 'checkForUpdates' },
        { separator: true },
        { id: 902, label: 'About ABDMCX0X...', labelEs: 'Acerca de ABDMCX0X...', action: 'about' },
      ],
    },
  ];
}
