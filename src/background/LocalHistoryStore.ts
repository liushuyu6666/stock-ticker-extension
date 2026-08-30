import { STORAGE_KEYS } from '../shared/messages';
import { MAX_HISTORY_BARS } from '../shared/series';
import type { DailyBar } from '../shared/types';
import type { HistoryStore } from './HistoryStore';

const MS_PER_DAY = 86_400_000;

/**
 * chrome.storage.local implementation.
 *
 * Series are stored as a start date plus whole-day offsets rather than one
 * `{date, close}` object per bar. Repeating the key names and a full ISO string
 * on every one of ~250 bars cost roughly three quarters of the payload; offsets
 * cut a year of closes from ~9.3 KB to ~2.7 KB. The decoded shape callers see
 * is unchanged — the encoding is private to this class.
 */
export class LocalHistoryStore implements HistoryStore {
  async getMany(symbols: string[]): Promise<Map<string, DailyBar[]>> {
    if (symbols.length === 0) return new Map();
    const keys = symbols.map((symbol) => STORAGE_KEYS.history(symbol));
    const stored = await chrome.storage.local.get(keys);
    const result = new Map<string, DailyBar[]>();
    for (const symbol of symbols) {
      result.set(symbol, decodeSeries(stored[STORAGE_KEYS.history(symbol)]));
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
      .slice(-MAX_HISTORY_BARS);

    await chrome.storage.local.set({ [STORAGE_KEYS.history(symbol)]: encodeSeries(merged) });
    await this.trackSymbol(symbol);
  }

  /**
   * Read straight off the encoded form. The hourly gap check asks this for
   * every symbol, and it has no reason to rebuild a few hundred objects only to
   * look at the last one.
   */
  async lastBarDate(symbol: string): Promise<string | null> {
    const key = STORAGE_KEYS.history(symbol);
    const raw = (await chrome.storage.local.get(key))[key];

    if (isEncodedSeries(raw)) {
      const last = raw.days[raw.days.length - 1];
      return last === undefined ? null : fromDayNumber(toDayNumber(raw.start) + last);
    }
    // Legacy array form, still on disk until this symbol's next upsert.
    const bars = decodeSeries(raw);
    return bars.length > 0 ? bars[bars.length - 1].date : null;
  }

  async remove(symbol: string): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEYS.history(symbol));
    const tracked = await this.trackedSymbols();
    await chrome.storage.local.set({
      [STORAGE_KEYS.historyIndex]: tracked.filter((entry) => entry !== symbol)
    });
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

  private async get(symbol: string): Promise<DailyBar[]> {
    const key = STORAGE_KEYS.history(symbol);
    const stored = await chrome.storage.local.get(key);
    return decodeSeries(stored[key]);
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

/**
 * `v` is a format marker. Without one, a later change to the layout would have
 * to guess at what it found on disk.
 */
interface EncodedSeries {
  v: 1;
  /** ISO date of the first bar. */
  start: string;
  /** Whole days after `start`, ascending. `days[0]` is always 0. */
  days: number[];
  /** Parallel to `days`. */
  closes: number[];
}

function encodeSeries(bars: DailyBar[]): EncodedSeries {
  const start = bars[0].date;
  const origin = toDayNumber(start);
  return {
    v: 1,
    start,
    days: bars.map((bar) => toDayNumber(bar.date) - origin),
    closes: bars.map((bar) => bar.close)
  };
}

/** Accepts both the encoded form and the legacy array, so upgrades need no migration step. */
function decodeSeries(raw: unknown): DailyBar[] {
  if (isEncodedSeries(raw)) {
    const origin = toDayNumber(raw.start);
    const bars: DailyBar[] = [];
    for (let i = 0; i < raw.days.length; i += 1) {
      const close = raw.closes[i];
      if (typeof close !== 'number' || !Number.isFinite(close)) continue;
      bars.push({ date: fromDayNumber(origin + raw.days[i]), close });
    }
    return bars;
  }

  if (Array.isArray(raw)) {
    return (raw as DailyBar[]).filter(
      (bar) => typeof bar?.date === 'string' && typeof bar?.close === 'number'
    );
  }
  return [];
}

function isEncodedSeries(raw: unknown): raw is EncodedSeries {
  const candidate = raw as EncodedSeries | undefined;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    candidate.v === 1 &&
    typeof candidate.start === 'string' &&
    Array.isArray(candidate.days) &&
    Array.isArray(candidate.closes)
  );
}

/** Whole days since the epoch. Dates are exchange-local calendar days, so UTC parsing is exact. */
function toDayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY);
}

function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}
