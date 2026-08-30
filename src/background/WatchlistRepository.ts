import { STORAGE_KEYS } from '../shared/messages';
import type { WatchlistEntry } from '../shared/types';

/**
 * The single source of truth for which symbols show and what each target is.
 * Stored in chrome.storage.sync so the watchlist follows the Chrome profile.
 */
export class WatchlistRepository {
  private static readonly DEFAULTS: WatchlistEntry[] = [
    { symbol: 'AAPL', targetPrice: 180, order: 0 },
    { symbol: 'MSFT', targetPrice: 420, order: 1 },
    { symbol: 'GOOGL', targetPrice: 180, order: 2 },
    { symbol: 'AMZN', targetPrice: 200, order: 3 },
    { symbol: 'TSLA', targetPrice: 260, order: 4 },
    { symbol: 'NVDA', targetPrice: 120, order: 5 },
    { symbol: 'META', targetPrice: 550, order: 6 }
  ];

  async list(): Promise<WatchlistEntry[]> {
    const stored = await chrome.storage.sync.get(STORAGE_KEYS.watchlist);
    const entries = stored[STORAGE_KEYS.watchlist];
    if (!Array.isArray(entries) || entries.length === 0) {
      return [...WatchlistRepository.DEFAULTS];
    }
    return (entries as WatchlistEntry[])
      .filter((entry) => typeof entry?.symbol === 'string' && entry.symbol.length > 0)
      .map((entry, index) => ({
        symbol: entry.symbol.toUpperCase(),
        targetPrice: Number.isFinite(entry.targetPrice) ? Number(entry.targetPrice) : 0,
        order: Number.isFinite(entry.order) ? Number(entry.order) : index
      }))
      .sort((a, b) => a.order - b.order);
  }

  async save(entries: WatchlistEntry[]): Promise<WatchlistEntry[]> {
    const normalized = entries
      .filter((entry) => typeof entry?.symbol === 'string' && entry.symbol.trim().length > 0)
      .map((entry, index) => ({
        symbol: entry.symbol.trim().toUpperCase(),
        targetPrice: Number.isFinite(entry.targetPrice) ? Number(entry.targetPrice) : 0,
        order: index
      }));

    const seen = new Set<string>();
    const deduped = normalized.filter((entry) => {
      if (seen.has(entry.symbol)) return false;
      seen.add(entry.symbol);
      return true;
    });

    await chrome.storage.sync.set({ [STORAGE_KEYS.watchlist]: deduped });
    return deduped;
  }

  async symbols(): Promise<string[]> {
    return (await this.list()).map((entry) => entry.symbol);
  }
}
