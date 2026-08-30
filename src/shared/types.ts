/** One row of the user's watchlist, as configured on the options page. */
export interface WatchlistEntry {
  symbol: string;
  /** The user's own target. Red above it, green at or below it. */
  targetPrice: number;
  order: number;
}

/** A live (typically ~15 min delayed) price for one symbol. */
export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  /** Epoch seconds of the last regular-market trade. */
  marketTime: number;
}

/** One closed trading day. Immutable once written. */
export interface DailyBar {
  /** YYYY-MM-DD in exchange-local terms. */
  date: string;
  close: number;
}

export type Trend = 'above' | 'atOrBelow';

/** Everything one card needs to render. The only shape the UI ever sees. */
export interface TickerRow {
  symbol: string;
  price: number | null;
  targetPrice: number;
  trend: Trend;
  /** Chronological closes for the sparkline; may be empty before first backfill. */
  closes: number[];
}

export interface TickerSnapshot {
  rows: TickerRow[];
  /** Epoch ms of the quote fetch these rows were built from. */
  updatedAt: number;
  /** Set when the last refresh failed; rows are then last-known-good. */
  error: string | null;
}
