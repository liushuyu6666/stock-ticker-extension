import { STORAGE_KEYS } from '../shared/messages';
import type { HistoryStore } from './HistoryStore';
import type { HistoryRange, QuoteProvider } from './QuoteProvider';
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

    // Pruning runs first, and crucially *before* the empty check. A watchlist
    // with nothing in it is not a reason to skip the sweep — it is the case
    // where every stored series has become an orphan at once. Returning early
    // here used to strand all of them permanently.
    await this.history.prune(symbols);
    if (symbols.length === 0) return;

    const target = lastTradingDay();
    // Group the stale symbols by the window each one needs, so a routine daily
    // top-up costs a 5d payload instead of re-downloading the whole year.
    const byRange = new Map<HistoryRange, string[]>();
    for (const symbol of symbols) {
      const last = await this.history.lastBarDate(symbol);
      if (last !== null && last >= target) continue;
      const range = rangeForGap(last, target);
      const group = byRange.get(range);
      if (group) group.push(symbol);
      else byRange.set(range, [symbol]);
    }
    if (byRange.size === 0) return;

    for (const [range, group] of byRange) {
      const fetched = await this.provider.fetchHistory(group, range);
      for (const [symbol, bars] of fetched) await this.history.upsert(symbol, bars);
    }
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
 * The smallest Yahoo range that covers the gap, with room to spare: `5d` returns
 * five *trading* days and so spans about a week of calendar time, `1mo` about
 * five weeks, `3mo` about thirteen. Each threshold sits well inside its window,
 * because under-fetching would silently leave a hole in the series while
 * over-fetching only costs bytes.
 */
function rangeForGap(lastBarDate: string | null, target: string): HistoryRange {
  // A symbol added moments ago has no bars at all and wants the full year.
  if (lastBarDate === null) return '1y';
  const days = Math.round(
    (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${lastBarDate}T00:00:00Z`)) / 86_400_000
  );
  if (days <= 4) return '5d';
  if (days <= 20) return '1mo';
  if (days <= 80) return '3mo';
  return '1y';
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
