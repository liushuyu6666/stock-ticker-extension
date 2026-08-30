import { sendMessage } from '../shared/messages';
import type { SymbolMatch } from '../shared/types';

/**
 * Search field plus its result dropdown. Debounced, keyboard-navigable, and
 * guarded against out-of-order responses — a slow request for "ms" must not
 * overwrite the results already shown for "msft".
 */
export class SymbolSearchBox {
  private static readonly DEBOUNCE_MS = 220;
  /** Matches the worker's cap; the endpoint honours it exactly. */
  private static readonly MAX_RESULTS = 7;

  private readonly input: HTMLInputElement;
  private readonly dropdown: HTMLElement;
  private matches: SymbolMatch[] = [];
  private highlighted = -1;
  private debounce: number | undefined;
  /** Monotonic id of the newest issued query; stale replies are discarded. */
  private queryToken = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly onPick: (match: SymbolMatch) => void,
    private readonly onViewAll: (query: string) => void
  ) {
    this.host.classList.add('search');

    const field = document.createElement('div');
    field.className = 'search-field';

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 20 20');
    icon.setAttribute('class', 'search-icon');
    icon.setAttribute('aria-hidden', 'true');
    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('d', 'M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3Zm4.5 10.5L17 17');
    iconPath.setAttribute('fill', 'none');
    iconPath.setAttribute('stroke', 'currentColor');
    iconPath.setAttribute('stroke-width', '1.7');
    iconPath.setAttribute('stroke-linecap', 'round');
    icon.append(iconPath);

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'search-input';
    this.input.placeholder = 'Add a ticker — search by symbol or company';
    this.input.setAttribute('aria-label', 'Search for a ticker to add');
    this.input.autocomplete = 'off';

    field.append(icon, this.input);

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'search-dropdown';
    this.dropdown.hidden = true;

    this.host.replaceChildren(field, this.dropdown);
    this.bind();
  }

  clear(): void {
    this.input.value = '';
    this.close();
  }

  private bind(): void {
    this.input.addEventListener('input', () => {
      window.clearTimeout(this.debounce);
      const query = this.input.value.trim();
      if (query.length === 0) {
        this.close();
        return;
      }
      this.debounce = window.setTimeout(() => void this.run(query), SymbolSearchBox.DEBOUNCE_MS);
    });

    this.input.addEventListener('keydown', (event) => {
      // Enter is handled before the visibility guard on purpose: if the list
      // has closed — a slow reply, a stray click, a query that returned
      // nothing — Enter should still take the user somewhere useful rather
      // than doing nothing at all.
      if (event.key === 'Enter' && this.dropdown.hidden) {
        const query = this.input.value.trim();
        if (query.length > 0) {
          event.preventDefault();
          window.clearTimeout(this.debounce);
          this.viewAll(query);
        }
        return;
      }
      if (this.dropdown.hidden) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.move(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.move(-1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        // Arrow-selected row opens that symbol; a bare Enter shows everything,
        // since the seven rows on offer are only the top of a longer list.
        const match = this.matches[this.highlighted];
        if (match) this.pick(match);
        else this.viewAll(this.input.value.trim());
      } else if (event.key === 'Escape') {
        this.close();
      }
    });

    document.addEventListener('click', (event) => {
      if (!this.host.contains(event.target as Node)) this.close();
    });
  }

  private async run(query: string): Promise<void> {
    const token = ++this.queryToken;
    try {
      const response = await sendMessage({ type: 'SEARCH_SYMBOLS', query });
      // A reply for an older keystroke arrived late — drop it.
      if (token !== this.queryToken) return;
      if ('matches' in response && response.ok) {
        this.matches = response.matches.slice(0, SymbolSearchBox.MAX_RESULTS);
        this.highlighted = -1;
        this.renderDropdown(query);
      }
    } catch {
      if (token === this.queryToken) this.close();
    }
  }

  private renderDropdown(query: string): void {
    this.dropdown.replaceChildren();

    if (this.matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = `No quick match for “${query}”`;
      this.dropdown.append(empty, this.viewAllRow(query));
      this.dropdown.hidden = false;
      return;
    }

    this.matches.forEach((match, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'search-row';
      row.dataset.index = String(index);

      const badge = document.createElement('span');
      badge.className = 'search-badge';
      badge.textContent = match.symbol.slice(0, 4);

      const text = document.createElement('span');
      text.className = 'search-text';
      const symbol = document.createElement('span');
      symbol.className = 'search-symbol';
      symbol.textContent = match.symbol;
      const name = document.createElement('span');
      name.className = 'search-name';
      name.textContent = match.name;
      text.append(symbol, name);

      const exchange = document.createElement('span');
      exchange.className = 'search-exchange';
      exchange.textContent = match.exchange;

      row.append(badge, text, exchange);
      row.addEventListener('click', () => this.pick(match));
      row.addEventListener('mousemove', () => {
        this.highlighted = index;
        this.paintHighlight();
      });
      this.dropdown.append(row);
    });

    this.dropdown.append(this.viewAllRow(query));
    this.dropdown.hidden = false;
    this.paintHighlight();
  }

  /**
   * The dropdown's endpoint returns seven rows and ignores any larger request,
   * so this is not merely a longer view of the same call — it is the only way
   * to reach the rest of the matches.
   */
  private viewAllRow(query: string): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'search-viewall';
    row.textContent = `View all matches for “${query}”`;
    row.addEventListener('click', () => this.viewAll(query));
    return row;
  }

  private viewAll(query: string): void {
    if (query.length === 0) return;
    this.close();
    this.onViewAll(query);
  }

  private move(delta: number): void {
    if (this.matches.length === 0) return;
    const next = this.highlighted + delta;
    // Wrap, so ArrowUp from the top lands on the last row.
    this.highlighted = (next + this.matches.length) % this.matches.length;
    this.paintHighlight();
  }

  private paintHighlight(): void {
    for (const row of this.dropdown.querySelectorAll<HTMLElement>('.search-row:not(.search-viewall)')) {
      row.classList.toggle('is-highlighted', Number(row.dataset.index) === this.highlighted);
    }
  }

  private pick(match: SymbolMatch): void {
    this.close();
    this.onPick(match);
  }

  private close(): void {
    this.dropdown.hidden = true;
    this.dropdown.replaceChildren();
    this.matches = [];
    this.highlighted = -1;
  }
}
