import { SURFACE_HEARTBEAT_MS } from '../shared/freshness';
import { STORAGE_KEYS, sendMessage } from '../shared/messages';
import type { SymbolMatch, TickerRow, TickerSnapshot } from '../shared/types';
import { ConfirmDialog } from './ConfirmDialog';
import { FreshnessClock } from './FreshnessClock';
import { SearchResultsView } from './SearchResultsView';
import { WatchlistBackup } from './WatchlistBackup';
import { SidebarNav } from './SidebarNav';
import { SymbolSearchBox } from './SymbolSearchBox';
import { TickerDetailDialog } from './TickerDetailDialog';
import { TickerGrid } from './TickerGrid';

const SECTIONS = [
  {
    id: 'tickers',
    label: 'Tickers',
    icon: 'M3 13.5 7 9l3.5 3.5L17 5.5M17 5.5h-4m4 0v4'
  }
];

/**
 * Shell and controller for the config page. Owns the current rows, routes
 * between the grid and the results list, and is the only place that talks to
 * the worker.
 */
export class ConfigApp {
  private readonly sidebar: SidebarNav;
  private readonly search: SymbolSearchBox;
  private readonly grid: TickerGrid;
  private readonly results: SearchResultsView;
  private readonly confirm: ConfirmDialog;
  private readonly detail: TickerDetailDialog;
  private readonly status: HTMLElement;
  private readonly body: HTMLElement;
  private readonly clock: FreshnessClock;
  private readonly refreshButton: HTMLButtonElement;

  private rows: TickerRow[] = [];
  /** Null while the grid is showing; the query string while results are. */
  private resultsQuery: string | null = null;
  private statusTimer: number | undefined;
  private heartbeat: number | undefined;
  /** Whether the snapshot on screen came from a refresh that failed. */
  private refreshFailed = false;

  constructor() {
    this.status = document.getElementById('status') as HTMLElement;
    this.body = document.getElementById('main-body') as HTMLElement;
    this.confirm = new ConfirmDialog(document.body);
    this.detail = new TickerDetailDialog(document.body);
    this.clock = new FreshnessClock(document.getElementById('freshness') as HTMLElement);
    this.refreshButton = document.getElementById('refresh') as HTMLButtonElement;
    this.refreshButton.addEventListener('click', () => void this.refreshNow());

    this.sidebar = new SidebarNav(
      document.getElementById('sidebar') as HTMLElement,
      SECTIONS,
      () => this.showTickers()
    );

    this.search = new SymbolSearchBox(
      document.getElementById('search') as HTMLElement,
      (match) => void this.openDetail(match.symbol),
      (query) => void this.showResults(query)
    );

    this.grid = new TickerGrid(
      this.body,
      (symbol, targetPrice) => void this.setTarget(symbol, targetPrice),
      (row) => void this.confirmRemove(row),
      (row) => void this.openDetail(row.symbol)
    );

    new WatchlistBackup(
      document.getElementById('export') as HTMLButtonElement,
      document.getElementById('import') as HTMLButtonElement,
      document.getElementById('import-file') as HTMLInputElement,
      (snapshot) => this.apply(snapshot),
      (message, isError) => this.setStatus(message, isError)
    );

    this.results = new SearchResultsView(
      this.body,
      (symbol) => void this.openDetail(symbol),
      () => this.showTickers()
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

    await this.pull();

    // The worker only polls while some surface is asking for rows, and asking
    // is what marks this page as one. Without this the countdown would tick
    // down to a refresh that had already stopped running.
    this.heartbeat = window.setInterval(() => void this.pull(), SURFACE_HEARTBEAT_MS);
  }

  /**
   * The manual equivalent of one scheduled tick: a gap check followed by a quote
   * poll, on the same code paths. The reply is a snapshot like any other, so the
   * countdown and the timestamp move with it.
   */
  private async refreshNow(): Promise<void> {
    this.refreshButton.disabled = true;
    this.clock.markRefreshing();
    try {
      const response = await sendMessage({ type: 'REFRESH_NOW' });
      if ('snapshot' in response && response.ok) {
        this.apply(response.snapshot);
        if (response.snapshot.error === null) this.setStatus('Prices refreshed.', false);
      } else if (!response.ok) {
        this.setStatus(response.error, true);
      }
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.refreshButton.disabled = false;
    }
  }

  /** Fetches the current snapshot and, in doing so, keeps the poll alive. */
  private async pull(): Promise<void> {
    try {
      const response = await sendMessage({ type: 'GET_SNAPSHOT' });
      if ('snapshot' in response && response.ok) this.apply(response.snapshot);
    } catch {
      // Reloading an extension orphans the pages it had already opened: this
      // document keeps rendering, but its `chrome.runtime` is gone and every
      // message rejects. Nothing here can recover it, and staying silent leaves
      // a page that looks live while its countdown quietly runs out — so say so
      // and stop pretending to poll.
      if (!chrome.runtime?.id) {
        window.clearInterval(this.heartbeat);
        this.setStatus('The extension was reloaded — reload this page to reconnect.', true, true);
        return;
      }
      // Otherwise the worker was merely asleep or restarting; the next tick retries.
    }
  }

  // ---- views ----

  private showTickers(): void {
    this.resultsQuery = null;
    this.grid.render(this.rows, this.refreshFailed);
  }

  private async showResults(query: string): Promise<void> {
    this.resultsQuery = query;
    await this.results.render(query, new Set(this.rows.map((row) => row.symbol)));
  }

  /**
   * Repaints whichever view is showing. A snapshot arriving while the results
   * list is open must not yank the user back to the grid.
   */
  private apply(snapshot: TickerSnapshot): void {
    this.rows = snapshot.rows;
    this.refreshFailed = snapshot.error !== null;
    this.clock.set({
      updatedAt: snapshot.updatedAt,
      attemptedAt: snapshot.attemptedAt,
      error: snapshot.error,
      hasRows: this.rows.length > 0
    });
    this.sidebar.setBadge('tickers', String(this.rows.length));
    const counter = document.getElementById('main-count');
    if (counter) {
      counter.textContent = this.rows.length === 1 ? '1 ticker' : `${this.rows.length} tickers`;
    }
    if (this.resultsQuery === null) this.grid.render(this.rows, this.refreshFailed);
    if (snapshot.error) this.setStatus('Last refresh failed — showing cached prices.', true);
  }

  // ---- actions ----

  /** One dialog serves both "should I add this?" and "what am I holding?". */
  private async openDetail(symbol: string): Promise<void> {
    const outcome = await this.detail.open(symbol);
    if (outcome.action === 'none') return;

    if (outcome.action === 'remove') {
      const row = this.rows.find((candidate) => candidate.symbol === symbol);
      if (row) await this.confirmRemove(row);
      return;
    }

    const existing = this.rows.find((candidate) => candidate.symbol === symbol);
    if (existing) {
      await this.setTarget(symbol, outcome.targetPrice);
      return;
    }
    await this.add(symbol, outcome.targetPrice);
  }

  private async add(symbol: string, targetPrice: number): Promise<void> {
    this.search.clear();
    this.setStatus(`Adding ${symbol} and fetching its history…`, false);

    // The dialog only carries a symbol; the worker fills in name and exchange
    // from the quote payload on the refresh that follows.
    const match: SymbolMatch = { symbol, name: symbol, exchange: '', type: '' };
    const response = await sendMessage({ type: 'ADD_SYMBOL', match, targetPrice });
    if (!response.ok) {
      this.setStatus(response.error, true);
      return;
    }
    if ('snapshot' in response) this.apply(response.snapshot);
    this.setStatus(`${symbol} added.`, false);
    // Reflect the new "Added" chip if the results list is what is on screen.
    if (this.resultsQuery !== null) await this.showResults(this.resultsQuery);
  }

  private async confirmRemove(row: TickerRow): Promise<void> {
    const result = await this.confirm.ask({
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
    if (this.resultsQuery !== null) await this.showResults(this.resultsQuery);
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

  private setStatus(message: string, isError: boolean, sticky = false): void {
    this.status.textContent = message;
    this.status.className = isError ? 'status is-error' : 'status is-ok';
    window.clearTimeout(this.statusTimer);
    if (sticky) return;
    this.statusTimer = window.setTimeout(() => {
      this.status.textContent = '';
      this.status.className = 'status';
    }, 4000);
  }
}
