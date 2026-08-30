import type { DailyBar, Quote } from '../shared/types';

/**
 * How far back to ask for daily bars. Yahoo only accepts a fixed vocabulary of
 * ranges, so a gap is served by the smallest window that covers it rather than
 * by an exact date.
 */
export type HistoryRange = '5d' | '1mo' | '3mo' | '1y';

/**
 * The seam that keeps the upstream data source swappable. Yahoo's endpoint is
 * undocumented and could disappear; a second implementation (Finnhub, Twelve
 * Data) only has to satisfy these two methods.
 */
export interface QuoteProvider {
  /** Live prices only. Cheap payload — polled on the minute. */
  fetchQuotes(symbols: string[]): Promise<Map<string, Quote>>;
  /**
   * Daily closes over `range`. Fetched at most once a trading day, and only for
   * the symbols whose stored series has actually fallen behind.
   */
  fetchHistory(symbols: string[], range: HistoryRange): Promise<Map<string, DailyBar[]>>;
}
