import type { SymbolMatch, SymbolPreview, TickerSnapshot, WatchlistEntry } from './types';

export const STORAGE_KEYS = {
  watchlist: 'watchlist',
  snapshot: 'cache:snapshot',
  history: (symbol: string) => `history:${symbol}`,
  historyIndex: 'history:index',
  lastConsumerSeenAt: 'meta:lastConsumerSeenAt',
  hiddenSites: 'hiddenSites'
} as const;

export type Request =
  | { type: 'GET_SNAPSHOT' }
  | { type: 'GET_WATCHLIST' }
  | { type: 'SEARCH_SYMBOLS'; query: string }
  | { type: 'LOOKUP_SYMBOLS'; query: string }
  | { type: 'PREVIEW_SYMBOL'; symbol: string }
  | { type: 'ADD_SYMBOL'; match: SymbolMatch; targetPrice: number }
  | { type: 'REMOVE_SYMBOL'; symbol: string }
  | { type: 'SET_TARGET'; symbol: string; targetPrice: number }
  | { type: 'IMPORT_WATCHLIST'; entries: WatchlistEntry[] }
  | { type: 'GET_HIDDEN_SITES' }
  | { type: 'SET_HIDDEN_SITES'; sites: string[] }
  | { type: 'REFRESH_NOW' }
  | { type: 'OPEN_CONFIG' };

export type Response =
  | { ok: true; snapshot: TickerSnapshot }
  | { ok: true; entries: WatchlistEntry[] }
  | { ok: true; sites: string[]; defaults: string[] }
  | { ok: true; matches: SymbolMatch[] }
  | { ok: true; preview: SymbolPreview }
  | { ok: true }
  | { ok: false; error: string };

export function sendMessage(request: Request): Promise<Response> {
  return chrome.runtime.sendMessage(request);
}
