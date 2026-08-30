import type { DailyBar, Quote } from '../shared/types';
import type { QuoteProvider } from './QuoteProvider';

const SPARK_URL = 'https://query1.finance.yahoo.com/v7/finance/spark';

/**
 * Yahoo's `spark` endpoint returns the live price and the daily close series in
 * a single batched call, so both methods hit the same URL with a different
 * range. No API key, no quota headers — but it is undocumented, hence the
 * defensive parsing below.
 *
 * Must run in the service worker: Yahoo sends no CORS headers, and only the
 * worker's host_permissions grant bypasses that.
 */
export class YahooQuoteProvider implements QuoteProvider {
  /** Yahoo rejects very long symbol lists; chunk defensively. */
  private static readonly CHUNK_SIZE = 20;

  async fetchQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    const result = new Map<string, Quote>();
    for (const chunk of chunked(symbols, YahooQuoteProvider.CHUNK_SIZE)) {
      const payload = await this.request(chunk, '1d');
      for (const entry of payload) {
        const meta = entry?.response?.[0]?.meta;
        if (!meta) continue;
        const price = meta.regularMarketPrice;
        if (typeof price !== 'number' || !Number.isFinite(price)) continue;
        result.set(entry.symbol, {
          symbol: entry.symbol,
          price,
          currency: typeof meta.currency === 'string' ? meta.currency : 'USD',
          marketTime: typeof meta.regularMarketTime === 'number' ? meta.regularMarketTime : 0
        });
      }
    }
    return result;
  }

  async fetchHistory(symbols: string[]): Promise<Map<string, DailyBar[]>> {
    const result = new Map<string, DailyBar[]>();
    for (const chunk of chunked(symbols, YahooQuoteProvider.CHUNK_SIZE)) {
      const payload = await this.request(chunk, '1y');
      for (const entry of payload) {
        const response = entry?.response?.[0];
        const stamps: unknown = response?.timestamp;
        const closes: unknown = response?.indicators?.quote?.[0]?.close;
        if (!Array.isArray(stamps) || !Array.isArray(closes)) continue;

        const bars: DailyBar[] = [];
        for (let i = 0; i < stamps.length; i += 1) {
          const close = closes[i];
          const stamp = stamps[i];
          // Yahoo emits nulls for halted days; skip rather than interpolate.
          if (typeof close !== 'number' || !Number.isFinite(close)) continue;
          if (typeof stamp !== 'number') continue;
          bars.push({ date: toIsoDate(stamp), close });
        }
        if (bars.length > 0) result.set(entry.symbol, bars);
      }
    }
    return result;
  }

  private async request(symbols: string[], range: '1d' | '1y'): Promise<SparkEntry[]> {
    const url = `${SPARK_URL}?symbols=${encodeURIComponent(symbols.join(','))}&range=${range}&interval=1d`;
    const response = await fetch(url, {
      // Yahoo 404s some requests that arrive without a browser-ish Accept header.
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(
        `[stock-ticker][YahooQuoteProvider][request] upstream rejected the request (status=${response.status} range=${range} symbols=${symbols.join('|')})`
      );
    }
    const body = await response.json();
    const results = body?.spark?.result;
    if (!Array.isArray(results)) {
      throw new Error(
        `[stock-ticker][YahooQuoteProvider][request] unexpected payload shape (expected=spark.result[] actual=${typeof results} range=${range})`
      );
    }
    return results as SparkEntry[];
  }
}

interface SparkEntry {
  symbol: string;
  response?: Array<{
    meta?: Record<string, unknown> & { regularMarketPrice?: number };
    timestamp?: number[];
    indicators?: { quote?: Array<{ close?: Array<number | null> }> };
  }>;
}

function toIsoDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
