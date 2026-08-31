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
  /** Only the lookup endpoint carries these; the dropdown's does not. */
  price?: number | null;
  changePercent?: number | null;
}

/** Everything the detail popup shows for one symbol, from a single request. */
export interface SymbolPreview {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number | null;
  changePercent: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  /**
   * Full one-year series — richer than the snapshot's render payload.
   * `dates` is parallel to `closes`: same length, same order, so the crosshair
   * can name the day under the cursor by index alone.
   */
  closes: number[];
  dates: string[];
  /** Lets the dialog offer "Add" or "Remove" without a second round trip. */
  onWatchlist: boolean;
  targetPrice: number;
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
  /**
   * Epoch ms of the last *successful* quote fetch — the age the UI reports and
   * the one staleness is measured against. A failed poll leaves it untouched.
   */
  updatedAt: number;
  /**
   * Epoch ms of the last quote poll *attempt*, successful or not. The countdown
   * runs off this one: after a failure `updatedAt` stops advancing, and a
   * countdown driven by it would sit at zero instead of saying when the next
   * try is due.
   */
  attemptedAt: number;
  /** Set when the last refresh failed; rows are then last-known-good. */
  error: string | null;
}
