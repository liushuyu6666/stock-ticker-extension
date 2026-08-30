import { STORAGE_KEYS } from '../shared/messages';
import type { DailyBar } from '../shared/types';
import type { HistoryStore } from './HistoryStore';

/**
 * chrome.storage.local implementation. A year of daily closes is ~250 floats,
 * so a realistic watchlist costs well under 100 KB of the 10 MB budget.
 */
export class LocalHistoryStore implements HistoryStore {
  /** Roughly one trading year plus slack, so the series never grows unbounded. */
  private static readonly MAX_BARS = 400;

  private async get(symbol: string): Promise<DailyBar[]> {
    const key = STORAGE_KEYS.history(symbol);
    const stored = await chrome.storage.local.get(key);
    const bars = stored[key];
    return Array.isArray(bars) ? (bars as DailyBar[]) : [];
  }

  async getMany(symbols: string[]): Promise<Map<string, DailyBar[]>> {
    if (symbols.length === 0) return new Map();
    const keys = symbols.map((symbol) => STORAGE_KEYS.history(symbol));
    const stored = await chrome.storage.local.get(keys);
    const result = new Map<string, DailyBar[]>();
    for (const symbol of symbols) {
      const bars = stored[STORAGE_KEYS.history(symbol)];
      result.set(symbol, Array.isArray(bars) ? (bars as DailyBar[]) : []);
    }
    return result;
  }

  /**
   * Merges by date rather than appending, which makes a missed day, a double
   * run, and a manual refresh all converge to the same series.
   */
  async upsert(symbol: string, bars: DailyBar[]): Promise<void> {
    if (bars.length === 0) return;
    const existing = await this.get(symbol);
    const byDate = new Map<string, number>();
    for (const bar of existing) byDate.set(bar.date, bar.close);
    for (const bar of bars) byDate.set(bar.date, bar.close);

    const merged = [...byDate.entries()]
      .map(([date, close]) => ({ date, close }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(-LocalHistoryStore.MAX_BARS);

    await chrome.storage.local.set({ [STORAGE_KEYS.history(symbol)]: merged });
    await this.trackSymbol(symbol);
  }

  async lastBarDate(symbol: string): Promise<string | null> {
    const bars = await this.get(symbol);
    return bars.length > 0 ? bars[bars.length - 1].date : null;
  }

  /** Drops series for symbols the user has removed from the watchlist. */
  async prune(keepSymbols: string[]): Promise<void> {
    const keep = new Set(keepSymbols);
    const tracked = await this.trackedSymbols();
    const stale = tracked.filter((symbol) => !keep.has(symbol));
    if (stale.length === 0) return;
    await chrome.storage.local.remove(stale.map((symbol) => STORAGE_KEYS.history(symbol)));
    await chrome.storage.local.set({
      [STORAGE_KEYS.historyIndex]: tracked.filter((symbol) => keep.has(symbol))
    });
  }

  private async trackedSymbols(): Promise<string[]> {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.historyIndex);
    const index = stored[STORAGE_KEYS.historyIndex];
    return Array.isArray(index) ? (index as string[]) : [];
  }

  private async trackSymbol(symbol: string): Promise<void> {
    const tracked = await this.trackedSymbols();
    if (tracked.includes(symbol)) return;
    await chrome.storage.local.set({ [STORAGE_KEYS.historyIndex]: [...tracked, symbol] });
  }
}
