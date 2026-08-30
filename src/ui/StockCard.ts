import type { TickerRow } from '../shared/types';
import { createSparkline } from './sparkline';

/** Renders exactly one card: Ticker | Current / Target | Sparkline. */
export class StockCard {
  static render(row: TickerRow): HTMLElement {
    const card = document.createElement('div');
    card.className = row.price === null ? 'card is-pending' : 'card';
    card.dataset.symbol = row.symbol;

    const symbol = document.createElement('span');
    symbol.className = 'symbol';
    symbol.textContent = row.symbol;

    const prices = document.createElement('span');
    prices.className = 'prices';
    prices.textContent = `${format(row.price)} / ${format(row.targetPrice)}`;

    card.append(symbol, prices, createSparkline(row.closes, row.trend));
    card.title = `${row.symbol} — current ${format(row.price)}, target ${format(row.targetPrice)}`;
    return card;
  }
}

function format(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toFixed(2);
}
