/**
 * ABDMCX0X -- mcxIcons.ts
 * Monochrome SVG icon primitives inheriting CSS `currentColor`.
 */

const BASE_ATTR = 'viewBox="0 0 12 12" aria-hidden="true" style="display:inline-block;vertical-align:-0.125em;flex-shrink:0"';

export const ICON_CLOSE = `<svg width="10" height="10" ${BASE_ATTR} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"/></svg>`;
export const ICON_UP = `<svg width="9" height="9" ${BASE_ATTR} fill="currentColor"><polygon points="6,2.5 10.5,9 1.5,9"/></svg>`;
export const ICON_DOWN = `<svg width="9" height="9" ${BASE_ATTR} fill="currentColor"><polygon points="6,9.5 10.5,3 1.5,3"/></svg>`;
export const ICON_PLAY = `<svg width="9" height="9" ${BASE_ATTR} fill="currentColor"><polygon points="3,2 10,6 3,10"/></svg>`;
export const ICON_MENU = `<svg width="11" height="11" ${BASE_ATTR} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 3h8M2 6h8M2 9h8"/></svg>`;
export const ICON_POWER_ON = `<svg width="9" height="9" ${BASE_ATTR} fill="currentColor"><circle cx="6" cy="6" r="4"/></svg>`;
export const ICON_POWER_OFF = `<svg width="9" height="9" ${BASE_ATTR} fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="6" cy="6" r="3.8"/></svg>`;
export const ICON_CLOCK = `<svg width="10" height="10" ${BASE_ATTR} fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="4.5"/><polyline points="6,3.5 6,6 8,7.2"/></svg>`;
export const ICON_EXPAND = `<svg width="10" height="10" ${BASE_ATTR} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7.5,2 10,2 10,4.5"/><line x1="6.5" y1="5.5" x2="10" y2="2"/><polyline points="4.5,10 2,10 2,7.5"/><line x1="5.5" y1="6.5" x2="2" y2="10"/></svg>`;
