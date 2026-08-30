import type { DailyBar, Quote } from '../shared/types';

/**
 * The seam that keeps the upstream data source swappable. Yahoo's endpoint is
 * undocumented and could disappear; a second implementation (Finnhub, Twelve
 * Data) only has to satisfy these two methods.
 */
export interface QuoteProvider {
  /** Live prices only. Cheap payload — polled on the minute. */
  fetchQuotes(symbols: string[]): Promise<Map<string, Quote>>;
  /** One year of daily closes. Larger payload — fetched at most once a day. */
  fetchHistory(symbols: string[]): Promise<Map<string, DailyBar[]>>;
}
