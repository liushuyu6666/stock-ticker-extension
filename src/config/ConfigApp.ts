import { STORAGE_KEYS, sendMessage } from '../shared/messages';
import type { SymbolMatch, TickerRow, TickerSnapshot } from '../shared/types';
import { ConfirmDialog } from './ConfirmDialog';
import { SidebarNav } from './SidebarNav';
import { SymbolSearchBox } from './SymbolSearchBox';
import { TickerGrid } from './TickerGrid';

const SECTIONS = [
  {
    id: 'tickers',
    label: 'Tickers',
    icon: 'M3 13.5 7 9l3.5 3.5L17 5.5M17 5.5h-4m4 0v4'
  }
];

/**
 * Shell and controller for the config page. Owns the current rows, wires the
 * three views together, and is the only place that talks to the worker.
 */
export class ConfigApp {
  private readonly sidebar: SidebarNav;
  private readonly search: SymbolSearchBox;
  private readonly grid: TickerGrid;
  private readonly dialog: ConfirmDialog;
  private readonly status: HTMLElement;
  private rows: TickerRow[] = [];

  constructor() {
    this.status = document.getElementById('status') as HTMLElement;
    this.dialog = new ConfirmDialog(document.body);

    this.sidebar = new SidebarNav(
      document.getElementById('sidebar') as HTMLElement,
      SECTIONS,
      () => {
        /* Only one section today; selecting it is already a no-op re-render. */
      }
    );

    this.search = new SymbolSearchBox(
      document.getElementById('search') as HTMLElement,
      (match) => void this.confirmAdd(match)
    );

    this.grid = new TickerGrid(
      document.getElementById('main-body') as HTMLElement,
      (symbol, targetPrice) => void this.setTarget(symbol, targetPrice),
      (row) => void this.confirmRemove(row)
    );
  }

  async start(): Promise<void> {
    this.sidebar.render();

    // The worker republishes through storage, so the page stays live while open.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const change = changes[STORAGE_KEYS.snapshot];
      if (change?.newValue) this.apply(change.newValue as TickerSnapshot);
    });

    const response = await sendMessage({ type: 'GET_SNAPSHOT' });
    if ('snapshot' in response && response.ok) this.apply(response.snapshot);
  }

  private apply(snapshot: TickerSnapshot): void {
    this.rows = snapshot.rows;
    this.grid.render(this.rows);
    this.sidebar.setBadge('tickers', String(this.rows.length));
    const counter = document.getElementById('main-count');
    if (counter) {
      counter.textContent = this.rows.length === 1 ? '1 ticker' : `${this.rows.length} tickers`;
    }
    if (snapshot.error) this.setStatus(`Last refresh failed — showing cached prices.`, true);
  }

  private async confirmAdd(match: SymbolMatch): Promise<void> {
    const exchange = match.exchange ? ` · ${match.exchange}` : '';
    const result = await this.dialog.ask({
      title: `Add ${match.symbol}?`,
      body: `${match.name}${exchange}. A year of daily closes is fetched right away so the sparkline is ready immediately.`,
      confirmLabel: 'Add ticker',
      numberField: { label: 'Target price (optional)', value: 0, placeholder: '0.00' }
    });
    if (!result.confirmed) return;

    this.search.clear();
    this.setStatus(`Adding ${match.symbol} and fetching its history…`, false);
    const response = await sendMessage({
      type: 'ADD_SYMBOL',
      match,
      targetPrice: result.numberValue
    });

    if (!response.ok) {
      this.setStatus(response.error, true);
      return;
    }
    if ('snapshot' in response) this.apply(response.snapshot);
    this.setStatus(`${match.symbol} added.`, false);
  }

  private async confirmRemove(row: TickerRow): Promise<void> {
    const result = await this.dialog.ask({
      title: `Remove ${row.symbol}?`,
      body: `${row.name} will be removed from the bar, and its stored year of daily closes will be deleted to reclaim the space.`,
      confirmLabel: 'Remove',
      destructive: true
    });
    if (!result.confirmed) return;

    const response = await sendMessage({ type: 'REMOVE_SYMBOL', symbol: row.symbol });
    if (!response.ok) {
      this.setStatus(response.error, true);
      return;
    }
    if ('snapshot' in response) this.apply(response.snapshot);
    this.setStatus(`${row.symbol} removed, history deleted.`, false);
  }

  private async setTarget(symbol: string, targetPrice: number): Promise<void> {
    const response = await sendMessage({ type: 'SET_TARGET', symbol, targetPrice });
    if (!response.ok) {
      this.setStatus(response.error, true);
      return;
    }
    if ('snapshot' in response) this.apply(response.snapshot);
    this.setStatus(`${symbol} target set to ${targetPrice.toFixed(2)}.`, false);
  }

  private setStatus(message: string, isError: boolean): void {
    this.status.textContent = message;
    this.status.className = isError ? 'status is-error' : 'status is-ok';
    window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => {
      this.status.textContent = '';
      this.status.className = 'status';
    }, 4000);
  }

  private statusTimer: number | undefined;
}
