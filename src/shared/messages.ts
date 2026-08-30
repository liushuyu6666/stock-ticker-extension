import type { TickerSnapshot, WatchlistEntry } from './types';

export const STORAGE_KEYS = {
  watchlist: 'watchlist',
  snapshot: 'cache:snapshot',
  history: (symbol: string) => `history:${symbol}`,
  historyIndex: 'history:index',
  lastConsumerSeenAt: 'meta:lastConsumerSeenAt'
} as const;

export type Request =
  | { type: 'GET_SNAPSHOT' }
  | { type: 'GET_WATCHLIST' }
  | { type: 'SAVE_WATCHLIST'; entries: WatchlistEntry[] }
  | { type: 'REFRESH_NOW' };

export type Response =
  | { ok: true; snapshot: TickerSnapshot }
  | { ok: true; entries: WatchlistEntry[] }
  | { ok: true }
  | { ok: false; error: string };

export function sendMessage(request: Request): Promise<Response> {
  return chrome.runtime.sendMessage(request);
}
