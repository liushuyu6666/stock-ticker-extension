import { STORAGE_KEYS } from '../shared/messages';
import { SNAPSHOT_SERIES_POINTS, downsampleSeries } from '../shared/series';
import type { DailyBar, Quote, TickerRow, TickerSnapshot, WatchlistEntry } from '../shared/types';
import type { HistoryStore } from './HistoryStore';
import type { QuoteProvider } from './QuoteProvider';
import type { WatchlistRepository } from './WatchlistRepository';

/**
 * Orchestrator. Joins live quotes, stored history, and user targets into the
 * one shape every surface renders, and owns the red/green rule. Depends only on
 * the three abstractions above — never on Yahoo or on a storage backend.
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

    try {
      const quotes = await this.provider.fetchQuotes(symbols);
      await this.watchlist.refreshLabels(
        new Map([...quotes].map(([symbol, quote]) => [symbol, { name: quote.name, exchange: quote.exchange }]))
      );
      const bars = await this.history.getMany(symbols);
      const rows = entries.map((entry) =>
        buildRow(entry, quotes.get(entry.symbol) ?? null, bars.get(entry.symbol) ?? [])
      );
      return this.publish({ rows, updatedAt: Date.now(), error: null });
    } catch (error) {
      // Keep the bar populated with the last good prices rather than blanking it.
      const previous = await this.readSnapshot();
      return this.publish(
        await this.join(previous, error instanceof Error ? error.message : String(error))
      );
    }
  }

  /**
   * Republishes from stored data alone — no network call. Edits that change
   * what is displayed without invalidating any price (a new target, a removed
   * ticker) go through here, since a fresh quote would tell them nothing they
   * do not already have.
   */
  async rebuild(): Promise<TickerSnapshot> {
    const previous = await this.readSnapshot();
    return this.publish(await this.join(previous, previous.error));
  }

  /** Joins the current watchlist and stored history onto known prices. */
  private async join(previous: TickerSnapshot, error: string | null): Promise<TickerSnapshot> {
    const entries = await this.watchlist.list();
    const bars = await this.history.getMany(entries.map((entry) => entry.symbol));
    const prices = new Map(previous.rows.map((row) => [row.symbol, row.price]));
    const rows = entries.map((entry) =>
      buildRow(entry, null, bars.get(entry.symbol) ?? [], prices.get(entry.symbol) ?? null)
    );
    return { rows, updatedAt: previous.updatedAt, error };
  }

  /**
   * Writing the snapshot to storage is also how every mounted surface learns
   * about it — they subscribe to storage.onChanged instead of holding a port.
   *
   * The write is skipped when nothing in the rows changed. Markets are shut for
   * roughly three quarters of the week, and through all of that the poll would
   * otherwise rewrite a byte-identical payload every minute and wake every open
   * surface to re-render it.
   */
  private async publish(snapshot: TickerSnapshot): Promise<TickerSnapshot> {
    const signature = JSON.stringify(snapshot.rows) + String(snapshot.error);
    if (signature === this.lastSignature) return snapshot;
    this.lastSignature = signature;
    await chrome.storage.local.set({ [STORAGE_KEYS.snapshot]: snapshot });
    return snapshot;
  }

  /**
   * In-memory only. A restarted worker publishes once before it settles, which
   * costs one redundant write and keeps the check free of its own storage key.
   */
  private lastSignature = '';
}

function buildRow(
  entry: WatchlistEntry,
  quote: Quote | null,
  bars: DailyBar[],
  fallbackPrice: number | null = null
): TickerRow {
  const price = quote?.price ?? fallbackPrice;
  return {
    symbol: entry.symbol,
    // The quote's label is fresher than the stored one when both are present.
    name: quote?.name || entry.name || entry.symbol,
    exchange: quote?.exchange || entry.exchange || '',
    price,
    targetPrice: entry.targetPrice,
    // Above target reads as red, at-or-below as green.
    trend: price !== null && price > entry.targetPrice ? 'above' : 'atOrBelow',
    // Downsampled to what the widest surface can actually draw. The full series
    // stays in the history store; this is a render payload, not a second copy.
    closes: downsampleSeries(
      bars.map((bar) => bar.close),
      SNAPSHOT_SERIES_POINTS
    )
  };
}
