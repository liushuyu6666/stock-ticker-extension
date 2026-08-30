import { sendMessage } from '../shared/messages';
import type { SymbolMatch } from '../shared/types';

/**
 * The "view all" destination. The dropdown's endpoint hard-caps at seven rows,
 * so this view is served by the lookup endpoint instead — which also hands back
 * a price and day change per row, at no extra request.
 */
export class SearchResultsView {
  constructor(
    private readonly host: HTMLElement,
    private readonly onPick: (symbol: string) => void,
    private readonly onBack: () => void
  ) {}

  async render(query: string, onWatchlist: Set<string>): Promise<void> {
    this.host.replaceChildren(this.frame(query, statusLine('Searching…')));

    let matches: SymbolMatch[] = [];
    try {
      const response = await sendMessage({ type: 'LOOKUP_SYMBOLS', query });
      if ('matches' in response && response.ok) matches = response.matches;
      else if (!response.ok) {
        this.host.replaceChildren(this.frame(query, statusLine(response.error)));
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.host.replaceChildren(this.frame(query, statusLine(message)));
      return;
    }

    if (matches.length === 0) {
      this.host.replaceChildren(this.frame(query, statusLine(`Nothing matched “${query}”.`)));
      return;
    }

    const list = document.createElement('div');
    list.className = 'results';
    for (const match of matches) list.append(this.row(match, onWatchlist.has(match.symbol)));

    this.host.replaceChildren(this.frame(query, list, matches.length));
  }

  private frame(query: string, body: HTMLElement, count?: number): HTMLElement {
    const wrap = document.createElement('section');

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back-link';
    back.textContent = '← Back to tickers';
    back.addEventListener('click', () => this.onBack());

    const heading = document.createElement('h2');
    heading.className = 'results-title';
    heading.textContent = `Results for “${query}”`;

    const sub = document.createElement('p');
    sub.className = 'results-count';
    sub.textContent = count === undefined ? '' : count === 1 ? '1 match' : `${count} matches`;

    wrap.append(back, heading, sub, body);
    return wrap;
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

function statusLine(message: string): HTMLElement {
  const status = document.createElement('p');
  status.className = 'results-status';
  status.textContent = message;
  return status;
}
