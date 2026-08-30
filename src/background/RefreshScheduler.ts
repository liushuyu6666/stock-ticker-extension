import { STORAGE_KEYS } from '../shared/messages';
import type { HistoryStore } from './HistoryStore';
import type { QuoteProvider } from './QuoteProvider';
import type { TickerService } from './TickerService';
import type { WatchlistRepository } from './WatchlistRepository';

const QUOTE_ALARM = 'ticker:quotes';
const HISTORY_ALARM = 'ticker:history';

/**
 * Two independent cadences, because the two kinds of data age differently: a
 * live price is stale in a minute, a closed day's close is never stale at all.
 */
export class RefreshScheduler {
  /** Chrome clamps alarm periods to one minute. */
  private static readonly QUOTE_PERIOD_MINUTES = 1;
  /**
   * An hourly *gap check* — "is my newest bar older than the last trading day?"
   * A wall-clock schedule would assume the browser happens to be running at that
   * moment; asking about the gap instead self-heals after a weekend or a
   * sleeping laptop, whenever the browser next wakes.
   */
  private static readonly HISTORY_PERIOD_MINUTES = 60;
  /** Stop polling prices once no bar has asked for a snapshot recently. */
  private static readonly CONSUMER_IDLE_MS = 5 * 60 * 1000;

  constructor(
    private readonly ticker: TickerService,
    private readonly provider: QuoteProvider,
    private readonly history: HistoryStore,
    private readonly watchlist: WatchlistRepository
  ) {}

  async install(): Promise<void> {
    await chrome.alarms.create(QUOTE_ALARM, {
      periodInMinutes: RefreshScheduler.QUOTE_PERIOD_MINUTES
    });
    await chrome.alarms.create(HISTORY_ALARM, {
      periodInMinutes: RefreshScheduler.HISTORY_PERIOD_MINUTES
    });
  }

  async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name === QUOTE_ALARM) {
      if (await this.hasRecentConsumer()) await this.ticker.refreshQuotes();
      return;
    }
    if (alarm.name === HISTORY_ALARM) await this.syncHistory();
  }

  /** Called on install, on wake, and whenever the watchlist changes. */
  async syncHistory(): Promise<void> {
    const symbols = await this.watchlist.symbols();
    if (symbols.length === 0) return;

    // Runs first and unconditionally: a series orphaned by a removal that raced
    // the worker's suspension would otherwise sit there until the next backfill
    // happened to need one, which could be never.
    await this.history.prune(symbols);

    const target = lastTradingDay();
    const stale: string[] = [];
    for (const symbol of symbols) {
      const last = await this.history.lastBarDate(symbol);
      // A symbol added today has no bars at all; both cases want a 1y backfill.
      if (last === null || last < target) stale.push(symbol);
    }
    if (stale.length === 0) return;

    const fetched = await this.provider.fetchHistory(stale);
    for (const [symbol, bars] of fetched) await this.history.upsert(symbol, bars);
  }

  /** Records that a bar is on screen, which re-enables quote polling. */
  async noteConsumerSeen(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.lastConsumerSeenAt]: Date.now() });
  }

  private async hasRecentConsumer(): Promise<boolean> {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.lastConsumerSeenAt);
    const seenAt = stored[STORAGE_KEYS.lastConsumerSeenAt];
    if (typeof seenAt !== 'number') return false;
    return Date.now() - seenAt < RefreshScheduler.CONSUMER_IDLE_MS;
  }
}

/**
 * The most recent weekday, in US market terms. Deliberately ignores exchange
 * holidays: the cost of being wrong is one redundant fetch, whereas a holiday
 * calendar would be a standing maintenance burden.
 */
function lastTradingDay(): string {
  // Shift into US/Eastern so the UTC getters below read as Eastern wall clock.
  // -5 is the conservative offset: it never calls a day closed too early.
  const eastern = new Date(Date.now() - 5 * 60 * 60 * 1000);
  // The regular session ends at 16:00 ET, so before then today has no close yet.
  if (eastern.getUTCHours() < 16) eastern.setUTCDate(eastern.getUTCDate() - 1);
  while (eastern.getUTCDay() === 0 || eastern.getUTCDay() === 6) {
    eastern.setUTCDate(eastern.getUTCDate() - 1);
  }
  return eastern.toISOString().slice(0, 10);
}
