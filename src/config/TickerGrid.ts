import type { TickerRow } from '../shared/types';
import { TickerCard } from './TickerCard';

/** Renders the whole collection, or the empty state when there is none. */
export class TickerGrid {
  constructor(
    private readonly host: HTMLElement,
    private readonly onTargetChange: (symbol: string, targetPrice: number) => void,
    private readonly onRemove: (row: TickerRow) => void,
    private readonly onOpen: (row: TickerRow) => void
  ) {}

  render(rows: TickerRow[]): void {
    if (rows.length === 0) {
      this.host.replaceChildren(this.renderEmpty());
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const row of rows) {
      grid.append(new TickerCard(row, this.onTargetChange, this.onRemove, this.onOpen).render());
    }
    this.host.replaceChildren(grid);
  }

  private renderEmpty(): HTMLElement {
    const empty = document.createElement('div');
    empty.className = 'empty';

    const title = document.createElement('h3');
    title.className = 'empty-title';
    title.textContent = 'No tickers yet';

    const body = document.createElement('p');
    body.className = 'empty-body';
    body.textContent = 'Search above to add one. Each ticker keeps a year of daily closes for its sparkline.';

    empty.append(title, body);
    return empty;
  }
}
