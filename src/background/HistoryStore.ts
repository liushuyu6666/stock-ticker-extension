import type { DailyBar } from '../shared/types';

/**
 * Where the one-year close series lives. `LocalHistoryStore` is the shipped
 * implementation; a Mongo-backed one (talking HTTP to a local service, since
 * MV3 has no TCP sockets) can be dropped in without touching TickerService.
 */
export interface HistoryStore {
  getMany(symbols: string[]): Promise<Map<string, DailyBar[]>>;
  /** Merge bars in, keyed by date. Idempotent — safe to re-run any day. */
  upsert(symbol: string, bars: DailyBar[]): Promise<void>;
  /** YYYY-MM-DD of the newest stored bar, or null when the symbol is unknown. */
  lastBarDate(symbol: string): Promise<string | null>;
  prune(keepSymbols: string[]): Promise<void>;
}
