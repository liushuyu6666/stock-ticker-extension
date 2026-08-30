/** One row of the user's watchlist, as configured on the config page. */
export interface WatchlistEntry {
  symbol: string;
  /** The user's own target. Red above it, green at or below it. */
  targetPrice: number;
  order: number;
  /** "Microsoft Corporation". Empty until the first quote or search fills it. */
  name: string;
  /** "NASDAQ". Empty when the upstream has no exchange for the instrument. */
  exchange: string;
}

/** A candidate returned by symbol search, before the user commits to it. */
export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string;
  /** "EQUITY", "ETF", "INDEX"… shown as a chip so ETFs are obvious. */
  type: string;
}

/** A live (typically ~15 min delayed) price for one symbol. */
export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  /** Epoch seconds of the last regular-market trade. */
  marketTime: number;
  /** Carried on the quote payload, so stored names self-heal for free. */
  name: string;
  exchange: string;
}

/** One closed trading day. Immutable once written. */
export interface DailyBar {
  /** YYYY-MM-DD in exchange-local terms. */
  date: string;
  close: number;
}

export type Trend = 'above' | 'atOrBelow';

/** Everything a card needs to render, on the bar and on the config page alike. */
export interface TickerRow {
  symbol: string;
  name: string;
  exchange: string;
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
