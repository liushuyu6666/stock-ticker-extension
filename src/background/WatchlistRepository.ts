import { STORAGE_KEYS } from '../shared/messages';
import type { SymbolMatch, WatchlistEntry } from '../shared/types';

/**
 * The single source of truth for which symbols show, what each target is, and
 * how each one is labelled. Stored in chrome.storage.sync so the watchlist
 * follows the Chrome profile.
 */
export class WatchlistRepository {
  private static readonly DEFAULTS: WatchlistEntry[] = [
    { symbol: 'AAPL', targetPrice: 180, order: 0, name: 'Apple Inc.', exchange: 'NasdaqGS' },
    { symbol: 'MSFT', targetPrice: 420, order: 1, name: 'Microsoft Corporation', exchange: 'NasdaqGS' },
    { symbol: 'GOOGL', targetPrice: 180, order: 2, name: 'Alphabet Inc.', exchange: 'NasdaqGS' },
    { symbol: 'AMZN', targetPrice: 200, order: 3, name: 'Amazon.com, Inc.', exchange: 'NasdaqGS' },
    { symbol: 'TSLA', targetPrice: 260, order: 4, name: 'Tesla, Inc.', exchange: 'NasdaqGS' },
    { symbol: 'NVDA', targetPrice: 120, order: 5, name: 'NVIDIA Corporation', exchange: 'NasdaqGS' },
    { symbol: 'META', targetPrice: 550, order: 6, name: 'Meta Platforms, Inc.', exchange: 'NasdaqGS' }
  ];

  async list(): Promise<WatchlistEntry[]> {
    const stored = await chrome.storage.sync.get(STORAGE_KEYS.watchlist);
    const entries = stored[STORAGE_KEYS.watchlist];
    if (!Array.isArray(entries)) return [...WatchlistRepository.DEFAULTS];
    // An empty array is a deliberate "I removed everything", not a missing key.
    return (entries as Partial<WatchlistEntry>[])
      .filter((entry) => typeof entry?.symbol === 'string' && entry.symbol.length > 0)
      .map((entry, index) => normalize(entry, index))
      .sort((a, b) => a.order - b.order);
  }

  async save(entries: WatchlistEntry[]): Promise<WatchlistEntry[]> {
    const seen = new Set<string>();
    const deduped = entries
      .filter((entry) => typeof entry?.symbol === 'string' && entry.symbol.trim().length > 0)
      .map((entry, index) => normalize(entry, index))
      .filter((entry) => {
        if (seen.has(entry.symbol)) return false;
        seen.add(entry.symbol);
        return true;
      })
      .map((entry, order) => ({ ...entry, order }));

    await chrome.storage.sync.set({ [STORAGE_KEYS.watchlist]: deduped });
    return deduped;
  }

  /** Appends a searched symbol. Returns false when it is already on the list. */
  async add(match: SymbolMatch, targetPrice: number): Promise<boolean> {
    const entries = await this.list();
    const symbol = match.symbol.trim().toUpperCase();
    if (entries.some((entry) => entry.symbol === symbol)) return false;

    entries.push({
      symbol,
      targetPrice: Number.isFinite(targetPrice) ? Number(targetPrice) : 0,
      order: entries.length,
      name: match.name,
      exchange: match.exchange
    });
    await this.save(entries);
    return true;
  }

  async remove(symbol: string): Promise<void> {
    const entries = await this.list();
    await this.save(entries.filter((entry) => entry.symbol !== symbol.toUpperCase()));
  }

  async setTarget(symbol: string, targetPrice: number): Promise<void> {
    const entries = await this.list();
    const target = entries.find((entry) => entry.symbol === symbol.toUpperCase());
    if (!target) return;
    target.targetPrice = Number.isFinite(targetPrice) ? Number(targetPrice) : 0;
    await this.save(entries);
  }

  /**
   * Writes back names and exchanges discovered on a quote payload. Only touches
   * storage when something actually changed, so the minute-by-minute quote poll
   * does not churn chrome.storage.sync and burn its write quota.
   */
  async refreshLabels(labels: Map<string, { name: string; exchange: string }>): Promise<void> {
    const entries = await this.list();
    let changed = false;
    for (const entry of entries) {
      const label = labels.get(entry.symbol);
      if (!label) continue;
      if (label.name && label.name !== entry.name) {
        entry.name = label.name;
        changed = true;
      }
      if (label.exchange && label.exchange !== entry.exchange) {
        entry.exchange = label.exchange;
        changed = true;
      }
    }
    if (changed) await this.save(entries);
  }

  async symbols(): Promise<string[]> {
    return (await this.list()).map((entry) => entry.symbol);
  }
}

function normalize(entry: Partial<WatchlistEntry>, index: number): WatchlistEntry {
  return {
    symbol: String(entry.symbol).trim().toUpperCase(),
    targetPrice: Number.isFinite(entry.targetPrice) ? Number(entry.targetPrice) : 0,
    order: Number.isFinite(entry.order) ? Number(entry.order) : index,
    // Entries stored before labels existed carry neither; the quote poll fills them.
    name: typeof entry.name === 'string' ? entry.name : '',
    exchange: typeof entry.exchange === 'string' ? entry.exchange : ''
  };
}
