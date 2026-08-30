import { SNAPSHOT_SERIES_POINTS } from '../shared/series';
import type { TickerRow } from '../shared/types';
import { createSparkline } from '../ui/sparkline';

/**
 * Sized for the card body; the svg stretches to the card via CSS. The 70-point
 * budget was picked the same way as the bar's 28 — by rendering a year of real
 * closes at 34/50/70/100/158 across 260px and taking the last one that still
 * reads as a trend line rather than a scratchy trace. It is also the cap the
 * snapshot stores, so the largest thing drawn and the most that is kept are one
 * number rather than two that can drift.
 */
const CARD_SPARKLINE = { width: 260, height: 48, fluid: true, points: SNAPSHOT_SERIES_POINTS };

/**
 * One ticker on the config page: identity, live price against target, a
 * year of trend, an editable target, and its own remove control.
 */
export class TickerCard {
  constructor(
    private readonly row: TickerRow,
    private readonly onTargetChange: (symbol: string, targetPrice: number) => void,
    private readonly onRemove: (row: TickerRow) => void,
    private readonly onOpen: (row: TickerRow) => void
  ) {}

  render(): HTMLElement {
    const { row } = this;
    const card = document.createElement('article');
    card.className = `card trend-${row.trend}`;
    card.dataset.symbol = row.symbol;

    card.append(this.renderHeader(), this.renderPrice(), this.renderSparkline(), this.renderTarget());

    // The card opens its detail view, but the target field and the remove
    // button are controls in their own right — a click on either is theirs.
    card.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.card-target') || target.closest('.card-remove')) return;
      this.onOpen(row);
    });
    card.title = `Show details for ${row.symbol}`;
    return card;
  }

  private renderHeader(): HTMLElement {
    const { row } = this;
    const header = document.createElement('header');
    header.className = 'card-header';

    const identity = document.createElement('div');
    identity.className = 'card-identity';

    const line = document.createElement('div');
    line.className = 'card-symbol-line';
    const symbol = document.createElement('h3');
    symbol.className = 'card-symbol';
    symbol.textContent = row.symbol;
    line.append(symbol);

    // Not every instrument reports one, so the chip is conditional.
    if (row.exchange) {
      const exchange = document.createElement('span');
      exchange.className = 'chip';
      exchange.textContent = row.exchange;
      line.append(exchange);
    }

    const name = document.createElement('p');
    name.className = 'card-name';
    name.textContent = row.name;
    // Long names are clipped to one line; the tooltip keeps them readable.
    name.title = row.name;

    identity.append(line, name);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'card-remove';
    remove.title = `Remove ${row.symbol}`;
    remove.setAttribute('aria-label', `Remove ${row.symbol}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => this.onRemove(row));

    header.append(identity, remove);
    return header;
  }

  private renderPrice(): HTMLElement {
    const { row } = this;
    const block = document.createElement('div');
    block.className = 'card-price';

    const current = document.createElement('span');
    current.className = 'card-current';
    current.textContent = format(row.price);

    const delta = document.createElement('span');
    delta.className = 'card-delta';
    delta.textContent = describeGap(row);

    block.append(current, delta);
    return block;
  }

  private renderSparkline(): HTMLElement {
    const { row } = this;
    const holder = document.createElement('div');
    holder.className = 'card-spark';

    if (row.closes.length === 0) {
      const pending = document.createElement('span');
      pending.className = 'card-spark-pending';
      pending.textContent = 'Loading one year of history…';
      holder.append(pending);
      return holder;
    }

    holder.append(createSparkline(row.closes, row.trend, CARD_SPARKLINE));
    return holder;
  }

  private renderTarget(): HTMLElement {
    const { row } = this;
    const footer = document.createElement('div');
    footer.className = 'card-target';

    const label = document.createElement('label');
    label.className = 'card-target-label';
    label.textContent = 'Target';

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.min = '0';
    input.className = 'card-target-input';
    input.value = String(row.targetPrice);
    input.setAttribute('aria-label', `Target price for ${row.symbol}`);

    // Commit on blur and Enter rather than per keystroke, so typing "1" on the
    // way to "180" does not write storage or repaint the card mid-edit.
    const commit = (): void => {
      const parsed = Number(input.value);
      const next = Number.isFinite(parsed) ? parsed : 0;
      if (next === row.targetPrice) return;
      this.onTargetChange(row.symbol, next);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
    });

    label.append(input);
    footer.append(label);
    return footer;
  }
}

function format(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toFixed(2);
}

/** The human reading of the red/green rule, in words rather than colour alone. */
function describeGap(row: TickerRow): string {
  if (row.price === null) return 'awaiting price';
  const gap = row.price - row.targetPrice;
  const pct = row.targetPrice > 0 ? Math.abs(gap / row.targetPrice) * 100 : 0;
  const direction = gap > 0 ? 'above' : 'below';
  if (gap === 0) return 'at target';
  return `${Math.abs(gap).toFixed(2)} ${direction} target · ${pct.toFixed(1)}%`;
}
