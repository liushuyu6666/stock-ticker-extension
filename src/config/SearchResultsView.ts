import { sendMessage } from '../shared/messages';
import type { SymbolMatch } from '../shared/types';

/** Stands in for an instrument that reports no exchange at all. */
const UNKNOWN_EXCHANGE = 'Other';
/** Sentinel for the "no filter" option; no real exchange is an empty string. */
const ALL_EXCHANGES = '';

/**
 * The "view all" destination. The dropdown's endpoint hard-caps at seven rows,
 * so this view is served by the lookup endpoint instead — which also hands back
 * a price and day change per row, at no extra request.
 *
 * A query this wide spans a lot of venues: "microsoft" alone returns the US
 * listing plus CDRs, depositary receipts and leveraged ETFs from a dozen
 * countries. Hence the exchange filter, which works on the fetched rows rather
 * than issuing another request.
 */
export class SearchResultsView {
  private matches: SymbolMatch[] = [];
  private query = '';
  private exchange: string = ALL_EXCHANGES;
  private onWatchlist = new Set<string>();

  constructor(
    private readonly host: HTMLElement,
    private readonly onPick: (symbol: string) => void,
    private readonly onBack: () => void
  ) {}

  /**
   * Fetches only when the query actually changes, so returning here after
   * adding a ticker repaints from what is already in hand — no second request,
   * and the chosen exchange survives.
   */
  async render(query: string, onWatchlist: Set<string>): Promise<void> {
    this.onWatchlist = onWatchlist;
    if (query === this.query) {
      this.paint();
      return;
    }

    this.query = query;
    // A new search says nothing about the old venue, so start unfiltered.
    this.exchange = ALL_EXCHANGES;
    this.matches = [];
    this.host.replaceChildren(this.frame(statusLine('Searching…')));

    try {
      const response = await sendMessage({ type: 'LOOKUP_SYMBOLS', query });
      if ('matches' in response && response.ok) this.matches = response.matches;
      else if (!response.ok) {
        this.host.replaceChildren(this.frame(statusLine(response.error)));
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.host.replaceChildren(this.frame(statusLine(message)));
      return;
    }
    this.paint();
  }

  private paint(): void {
    if (this.matches.length === 0) {
      this.host.replaceChildren(this.frame(statusLine(`Nothing matched “${this.query}”.`)));
      return;
    }

    const visible = this.matches.filter(
      (match) => this.exchange === ALL_EXCHANGES || exchangeOf(match) === this.exchange
    );

    const body = document.createElement('div');
    if (visible.length === 0) {
      // Only reachable if a filter is on, since an empty list is handled above.
      body.append(statusLine(`No ${this.exchange} listings among these matches.`));
    } else {
      const list = document.createElement('div');
      list.className = 'results';
      for (const match of visible) list.append(this.row(match, this.onWatchlist.has(match.symbol)));
      body.append(list);
    }

    this.host.replaceChildren(this.frame(body, visible.length));
  }

  /** Counts come from the whole result set, so a filtered view still shows them. */
  private exchangeCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const match of this.matches) {
      const name = exchangeOf(match);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }

  private filterControl(): HTMLElement {
    const wrap = document.createElement('label');
    wrap.className = 'filter';

    const label = document.createElement('span');
    label.className = 'filter-label';
    label.textContent = 'Exchange';

    const select = document.createElement('select');
    select.className = 'filter-select';

    const all = document.createElement('option');
    all.value = ALL_EXCHANGES;
    all.textContent = `All exchanges (${this.matches.length})`;
    select.append(all);

    // Busiest venue first: with two dozen options, alphabetical would bury the
    // listing the user almost certainly wants.
    const sorted = [...this.exchangeCounts()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    for (const [name, count] of sorted) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = `${name} (${count})`;
      select.append(option);
    }

    select.value = this.exchange;
    select.addEventListener('change', () => {
      this.exchange = select.value;
      this.paint();
    });

    wrap.append(label, select);
    return wrap;
  }

  private frame(body: HTMLElement, visibleCount?: number): HTMLElement {
    const wrap = document.createElement('section');

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back-link';
    back.textContent = '← Back to tickers';
    back.addEventListener('click', () => this.onBack());

    const heading = document.createElement('h2');
    heading.className = 'results-title';
    heading.textContent = `Results for “${this.query}”`;

    const bar = document.createElement('div');
    bar.className = 'results-bar';

    const sub = document.createElement('p');
    sub.className = 'results-count';
    sub.textContent = visibleCount === undefined ? '' : this.countLabel(visibleCount);
    bar.append(sub);

    if (this.matches.length > 0) bar.append(this.filterControl());

    wrap.append(back, heading, bar, body);
    return wrap;
  }

  private countLabel(visible: number): string {
    const total = this.matches.length;
    // Saying "12 of 50" makes it obvious the filter is hiding things.
    if (this.exchange !== ALL_EXCHANGES) return `${visible} of ${total} matches`;
    return total === 1 ? '1 match' : `${total} matches`;
  }

  private row(match: SymbolMatch, isOnWatchlist: boolean): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'result-row';
    row.addEventListener('click', () => this.onPick(match.symbol));

    const badge = document.createElement('span');
    badge.className = 'search-badge';
    badge.textContent = match.symbol.slice(0, 4);

    const text = document.createElement('span');
    text.className = 'search-text';
    const symbolLine = document.createElement('span');
    symbolLine.className = 'result-symbol-line';
    const symbol = document.createElement('span');
    symbol.className = 'search-symbol';
    symbol.textContent = match.symbol;
    symbolLine.append(symbol);
    if (match.type) {
      const type = document.createElement('span');
      type.className = 'chip chip-type';
      type.textContent = match.type;
      symbolLine.append(type);
    }
    if (isOnWatchlist) {
      const on = document.createElement('span');
      on.className = 'chip chip-on';
      on.textContent = 'Added';
      symbolLine.append(on);
    }
    const name = document.createElement('span');
    name.className = 'search-name';
    name.textContent = match.name;
    text.append(symbolLine, name);

    const numbers = document.createElement('span');
    numbers.className = 'result-numbers';
    const price = document.createElement('span');
    price.className = 'result-price';
    price.textContent = match.price === null || match.price === undefined ? '—' : match.price.toFixed(2);
    numbers.append(price);
    if (match.changePercent !== null && match.changePercent !== undefined) {
      const change = document.createElement('span');
      const up = match.changePercent >= 0;
      change.className = up ? 'result-change is-up' : 'result-change is-down';
      change.textContent = `${up ? '+' : '−'}${Math.abs(match.changePercent).toFixed(2)}%`;
      numbers.append(change);
    }

    const exchange = document.createElement('span');
    exchange.className = 'search-exchange';
    exchange.textContent = match.exchange;

    row.append(badge, text, numbers, exchange);
    return row;
  }
}

function exchangeOf(match: SymbolMatch): string {
  return match.exchange.trim().length > 0 ? match.exchange : UNKNOWN_EXCHANGE;
}

function statusLine(message: string): HTMLElement {
  const status = document.createElement('p');
  status.className = 'results-status';
  status.textContent = message;
  return status;
}
