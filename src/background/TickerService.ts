import { STORAGE_KEYS } from '../shared/messages';
import type { TickerRow, TickerSnapshot, WatchlistEntry } from '../shared/types';
import type { HistoryStore } from './HistoryStore';
import type { QuoteProvider } from './QuoteProvider';
import type { WatchlistRepository } from './WatchlistRepository';

/**
 * Orchestrator. Joins live quotes, stored history, and user targets into the
 * one shape the UI renders, and owns the red/green rule. Depends only on the
 * three abstractions above — never on Yahoo or on a storage backend directly.
 */
export class TickerService {
  constructor(
    private readonly provider: QuoteProvider,
    private readonly history: HistoryStore,
    private readonly watchlist: WatchlistRepository
  ) {}

  /** Last-known-good snapshot, without touching the network. */
  async readSnapshot(): Promise<TickerSnapshot> {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.snapshot);
    const snapshot = stored[STORAGE_KEYS.snapshot] as TickerSnapshot | undefined;
    if (snapshot && Array.isArray(snapshot.rows)) return snapshot;
    return { rows: [], updatedAt: 0, error: null };
  }

  /**
   * Refreshes prices and republishes the snapshot. History is read from the
   * store, never fetched here — that is the daily job's business.
   */
  async refreshQuotes(): Promise<TickerSnapshot> {
    const entries = await this.watchlist.list();
    if (entries.length === 0) {
      return this.publish({ rows: [], updatedAt: Date.now(), error: null });
    }

    const symbols = entries.map((entry) => entry.symbol);
    const bars = await this.history.getMany(symbols);

    try {
      const quotes = await this.provider.fetchQuotes(symbols);
      const rows = entries.map((entry) =>
        buildRow(entry, quotes.get(entry.symbol)?.price ?? null, bars.get(entry.symbol) ?? [])
      );
      return this.publish({ rows, updatedAt: Date.now(), error: null });
    } catch (error) {
      // Keep the bar populated with the last good prices rather than blanking it.
      const previous = await this.readSnapshot();
      const previousPrices = new Map(previous.rows.map((row) => [row.symbol, row.price]));
      const rows = entries.map((entry) =>
        buildRow(entry, previousPrices.get(entry.symbol) ?? null, bars.get(entry.symbol) ?? [])
      );
      return this.publish({
        rows,
        updatedAt: previous.updatedAt,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Writing the snapshot to storage is also how every mounted bar learns about
   * it — they subscribe to storage.onChanged instead of holding a port open.
   */
  private async publish(snapshot: TickerSnapshot): Promise<TickerSnapshot> {
    await chrome.storage.local.set({ [STORAGE_KEYS.snapshot]: snapshot });
    return snapshot;
  }
}

function buildRow(entry: WatchlistEntry, price: number | null, bars: { close: number }[]): TickerRow {
  return {
    symbol: entry.symbol,
    price,
    targetPrice: entry.targetPrice,
    // Above target reads as red, at-or-below as green.
    trend: price !== null && price > entry.targetPrice ? 'above' : 'atOrBelow',
    closes: bars.map((bar) => bar.close)
  };
}
