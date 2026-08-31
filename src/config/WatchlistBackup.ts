import { sendMessage } from '../shared/messages';
import { formatIsoLocal } from '../shared/freshness';
import type { TickerSnapshot, WatchlistEntry } from '../shared/types';

const FORMAT = 'stock-ticker-watchlist';

interface BackupFile {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  entries: Array<Pick<WatchlistEntry, 'symbol' | 'targetPrice' | 'name' | 'exchange'>>;
}

/**
 * Export and import of the watchlist as a JSON file.
 *
 * Chrome deletes every byte an extension owns when it is uninstalled — both
 * storage areas, and the synced copy on the server with them. No API keeps data
 * across that boundary, so surviving a reinstall means holding a copy somewhere
 * Chrome does not control: a file the user keeps.
 */
export class WatchlistBackup {
  constructor(
    private readonly exportButton: HTMLButtonElement,
    private readonly importButton: HTMLButtonElement,
    private readonly fileInput: HTMLInputElement,
    private readonly onImported: (snapshot: TickerSnapshot) => void,
    private readonly onStatus: (message: string, isError: boolean) => void
  ) {
    this.exportButton.addEventListener('click', () => void this.export());
    this.importButton.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', () => void this.import());
  }

  private async export(): Promise<void> {
    const response = await sendMessage({ type: 'GET_WATCHLIST' });
    if (!('entries' in response) || !response.ok) {
      this.onStatus('Could not read the watchlist.', true);
      return;
    }

    const file: BackupFile = {
      format: FORMAT,
      version: 1,
      exportedAt: formatIsoLocal(Date.now()),
      entries: response.entries.map(({ symbol, targetPrice, name, exchange }) => ({
        symbol,
        targetPrice,
        name,
        exchange
      }))
    };

    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-ticker-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    // Revoking immediately can cancel the download in flight; one turn is enough.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.onStatus(`Exported ${file.entries.length} tickers.`, false);
  }

  private async import(): Promise<void> {
    const file = this.fileInput.files?.[0];
    // Clearing the input is what lets the same file be picked twice in a row.
    this.fileInput.value = '';
    if (!file) return;

    let entries: WatchlistEntry[];
    try {
      entries = parse(await file.text());
    } catch (error) {
      this.onStatus(error instanceof Error ? error.message : String(error), true);
      return;
    }

    this.importButton.disabled = true;
    try {
      const response = await sendMessage({ type: 'IMPORT_WATCHLIST', entries });
      if ('snapshot' in response && response.ok) {
        this.onImported(response.snapshot);
        this.onStatus(`Imported ${entries.length} tickers.`, false);
      } else if (!response.ok) {
        this.onStatus(response.error, true);
      }
    } finally {
      this.importButton.disabled = false;
    }
  }
}

/**
 * Accepts a file this extension wrote, or a bare array of entries — the second
 * so a hand-written list is not rejected for missing a wrapper it cannot know
 * about. Anything without a usable symbol is dropped rather than failing the
 * whole import.
 */
export function parse(text: string): WatchlistEntry[] {
  const parsed: unknown = JSON.parse(text);
  const raw = Array.isArray(parsed)
    ? parsed
    : (parsed as Partial<BackupFile> | null)?.entries;
  if (!Array.isArray(raw)) {
    throw new Error('That file does not contain a watchlist (expected an "entries" array).');
  }

  const entries = raw
    .filter((entry): entry is Partial<WatchlistEntry> => typeof entry === 'object' && entry !== null)
    .filter((entry) => typeof entry.symbol === 'string' && entry.symbol.trim().length > 0)
    .map((entry, index) => ({
      symbol: String(entry.symbol).trim().toUpperCase(),
      // Coerced before the finiteness test, not after: a file written by hand or
      // by a spreadsheet carries `"180"`, and rejecting it would silently reset
      // every target to zero.
      targetPrice: toNumber(entry.targetPrice),
      order: index,
      name: typeof entry.name === 'string' ? entry.name : '',
      exchange: typeof entry.exchange === 'string' ? entry.exchange : ''
    }));

  if (entries.length === 0) throw new Error('No tickers found in that file.');
  return entries;
}

function toNumber(candidate: unknown): number {
  const value = Number(candidate);
  return Number.isFinite(value) ? value : 0;
}
