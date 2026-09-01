import { sendMessage } from '../shared/messages';
import { DETAIL_SERIES_POINTS } from '../shared/series';
import type { SymbolPreview, Trend } from '../shared/types';
import { createSparkline, sparklineGeometry } from '../ui/sparkline';

const DETAIL_SPARKLINE = { width: 420, height: 120, fluid: true, points: DETAIL_SERIES_POINTS };

export interface DetailOutcome {
  action: 'add' | 'remove' | 'none';
  targetPrice: number;
}

/**
 * The rich popup behind a click on any symbol — a dropdown row, a results-page
 * row, or a card already on the watchlist. It fetches its own data, so it can
 * show a full year for a symbol the extension has never stored.
 */
export class TickerDetailDialog {
  private readonly backdrop: HTMLElement;

  constructor(host: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'modal-backdrop';
    this.backdrop.hidden = true;
    host.append(this.backdrop);
  }

  /** Opens on a loading frame, then swaps in the data when it arrives. */
  async open(symbol: string): Promise<DetailOutcome> {
    const card = document.createElement('div');
    card.className = 'modal modal-detail';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.append(loadingFrame(symbol));

    this.backdrop.replaceChildren(card);
    this.backdrop.hidden = false;

    let preview: SymbolPreview;
    try {
      const response = await sendMessage({ type: 'PREVIEW_SYMBOL', symbol });
      if (!('preview' in response) || !response.ok) {
        throw new Error('error' in response ? response.error : 'no preview returned');
      }
      preview = response.preview;
    } catch (error) {
      card.replaceChildren(
        errorFrame(symbol, error instanceof Error ? error.message : String(error))
      );
      return this.waitForDismiss(card);
    }

    return this.renderLoaded(card, preview);
  }

  private renderLoaded(card: HTMLElement, preview: SymbolPreview): Promise<DetailOutcome> {
    return new Promise((resolve) => {
      const target = document.createElement('input');
      target.type = 'number';
      target.step = '0.01';
      target.min = '0';
      target.value = preview.targetPrice > 0 ? String(preview.targetPrice) : '';
      target.placeholder = preview.price !== null ? preview.price.toFixed(2) : '0.00';
      target.setAttribute('aria-label', `Target price for ${preview.symbol}`);

      const finish = (action: DetailOutcome['action']): void => {
        document.removeEventListener('keydown', onKey);
        this.backdrop.hidden = true;
        this.backdrop.replaceChildren();
        const parsed = Number(target.value);
        resolve({ action, targetPrice: Number.isFinite(parsed) ? parsed : 0 });
      };

      const onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') finish('none');
      };
      document.addEventListener('keydown', onKey);
      this.backdrop.onclick = (event) => {
        if (event.target === this.backdrop) finish('none');
      };

      card.replaceChildren(
        header(preview),
        priceBlock(preview),
        sparklineBlock(preview, target.value),
        statsBlock(preview),
        targetRow(target),
        actionRow(preview, finish)
      );

      // Retint the sparkline live as the target moves across the price. The
      // crosshair is rewired with it, since the svg it tracks is replaced.
      target.addEventListener('input', () => {
        const holder = card.querySelector<HTMLElement>('.detail-spark');
        if (holder) paintSpark(holder, preview, target.value);
      });

      target.focus();
    });
  }

  private waitForDismiss(card: HTMLElement): Promise<DetailOutcome> {
    return new Promise((resolve) => {
      const close = (): void => {
        this.backdrop.hidden = true;
        this.backdrop.replaceChildren();
        resolve({ action: 'none', targetPrice: 0 });
      };
      this.backdrop.onclick = (event) => {
        if (event.target === this.backdrop) close();
      };
      card.querySelector('.js-close')?.addEventListener('click', close);
    });
  }
}

function trendFor(preview: SymbolPreview, rawTarget: string): Trend {
  const target = Number(rawTarget);
  // An empty or unparsable target means "no line drawn yet" — read as green.
  if (!Number.isFinite(target) || target <= 0 || preview.price === null) return 'atOrBelow';
  return preview.price > target ? 'above' : 'atOrBelow';
}

/**
 * Fills the sparkline holder and wires the hover crosshair.
 *
 * Purely local: every close and date is already in the preview the dialog
 * fetched when it opened, so tracking the cursor costs no request.
 */
function paintSpark(holder: HTMLElement, preview: SymbolPreview, rawTarget: string): void {
  if (preview.closes.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'detail-spark-empty';
    empty.textContent = 'No history available for this symbol.';
    holder.replaceChildren(empty);
    return;
  }

  const svg = createSparkline(preview.closes, trendFor(preview, rawTarget), DETAIL_SPARKLINE);

  const cursor = document.createElement('div');
  cursor.className = 'spark-cursor';
  const dot = document.createElement('div');
  dot.className = 'spark-dot';
  const tip = document.createElement('div');
  tip.className = 'spark-tip';
  const tipDate = document.createElement('span');
  tipDate.className = 'spark-tip-date';
  const tipPrice = document.createElement('span');
  tipPrice.className = 'spark-tip-price';

  const targetLine = document.createElement('div');
  targetLine.className = 'spark-target';
  const targetLabel = document.createElement('span');
  targetLabel.className = 'spark-target-label';
  targetLine.append(targetLabel);
  tip.append(tipDate, tipPrice);

  const hide = (): void => {
    holder.classList.remove('is-tracking');
  };

  // The dialog draws every session, so a point index is a trading day index —
  // no separate lookup is needed to name the day under the cursor.
  const geometry = sparklineGeometry(preview.closes, DETAIL_SPARKLINE.points, DETAIL_SPARKLINE.height);
  const lastIndex = geometry.points.length - 1;

  /**
   * The overlays are positioned against the holder, but every fraction is a
   * fraction *of the svg* — and the svg sits inside the holder's padding.
   * Measuring the gap rather than assuming it keeps the dot on the line if the
   * padding ever changes.
   */
  const offsets = (): { box: DOMRect; dx: number; dy: number } => {
    const box = svg.getBoundingClientRect();
    const outer = holder.getBoundingClientRect();
    return { box, dx: box.left - outer.left, dy: box.top - outer.top };
  };

  const placeTarget = (): void => {
    const target = Number(rawTarget);
    const { box, dy } = offsets();
    // Drawn only when it falls inside the year actually charted: a line pinned
    // to the top or bottom edge would claim a price the chart cannot show.
    const inRange =
      Number.isFinite(target) && target > 0 && target >= geometry.min && target <= geometry.max;
    targetLine.hidden = !inRange || box.height === 0;
    if (targetLine.hidden) return;
    targetLine.style.top = `${dy + geometry.valueFraction(target) * box.height}px`;
    targetLabel.textContent = `target ${target.toFixed(2)}`;
  };

  const track = (event: PointerEvent): void => {
    const { box, dx, dy } = offsets();
    if (box.width === 0) return;

    const ratio = clamp((event.clientX - box.left) / box.width, 0, 1);
    const index = Math.round(ratio * lastIndex);

    const x = dx + geometry.xFraction(index) * box.width;
    const y = dy + geometry.yFraction(index) * box.height;

    cursor.style.left = `${x}px`;
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;

    tipDate.textContent = formatDate(preview.dates[index]);
    tipPrice.textContent = geometry.points[index].toFixed(2);

    // Clamp so the label never hangs off either edge of the chart.
    const half = tip.getBoundingClientRect().width / 2;
    tip.style.left = `${clamp(x, dx + half, dx + box.width - half)}px`;
    tip.style.top = `${y}px`;

    holder.classList.add('is-tracking');
  };

  holder.replaceChildren(svg, targetLine, cursor, dot, tip);
  holder.onpointermove = track;
  holder.onpointerleave = hide;
  holder.onpointercancel = hide;

  // Layout has not happened yet on the frame the dialog opens, so every box
  // would measure zero; and the chart is sized in vh, so a resized window has
  // to re-place the line.
  requestAnimationFrame(placeTarget);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(placeTarget).observe(holder);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  // Parsed and formatted as UTC, or a local offset would shift the label a day.
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function header(preview: SymbolPreview): HTMLElement {
  const head = document.createElement('header');
  head.className = 'detail-head';

  const line = document.createElement('div');
  line.className = 'detail-symbol-line';
  const symbol = document.createElement('h2');
  symbol.className = 'detail-symbol';
  symbol.textContent = preview.symbol;
  line.append(symbol);
  if (preview.exchange) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = preview.exchange;
    line.append(chip);
  }
  if (preview.onWatchlist) {
    const chip = document.createElement('span');
    chip.className = 'chip chip-on';
    chip.textContent = 'On your bar';
    line.append(chip);
  }

  const name = document.createElement('p');
  name.className = 'detail-name';
  name.textContent = preview.name;

  head.append(line, name);
  return head;
}

function priceBlock(preview: SymbolPreview): HTMLElement {
  const block = document.createElement('div');
  block.className = 'detail-price';

  const price = document.createElement('span');
  price.className = 'detail-current';
  price.textContent = preview.price === null ? '—' : preview.price.toFixed(2);

  const currency = document.createElement('span');
  currency.className = 'detail-currency';
  currency.textContent = preview.currency;

  block.append(price, currency);

  if (preview.changePercent !== null) {
    const change = document.createElement('span');
    const up = preview.changePercent >= 0;
    change.className = up ? 'detail-change is-up' : 'detail-change is-down';
    change.textContent = `${up ? '▲' : '▼'} ${Math.abs(preview.changePercent).toFixed(2)}% today`;
    block.append(change);
  }
  return block;
}

function sparklineBlock(preview: SymbolPreview, rawTarget: string): HTMLElement {
  const holder = document.createElement('div');
  holder.className = 'detail-spark';
  paintSpark(holder, preview, rawTarget);

  const wrap = document.createElement('div');
  wrap.className = 'detail-spark-wrap';
  const label = document.createElement('span');
  label.className = 'detail-spark-label';
  label.textContent = 'Past year';
  const hint = document.createElement('span');
  hint.className = 'detail-spark-hint';
  hint.textContent = 'hover for any day';
  const head = document.createElement('div');
  head.className = 'detail-spark-head';
  head.append(label, hint);
  wrap.append(head, holder);
  return wrap;
}

function statsBlock(preview: SymbolPreview): HTMLElement {
  const stats = document.createElement('dl');
  stats.className = 'detail-stats';
  const rows: [string, number | null][] = [
    ["Day's low", preview.dayLow],
    ["Day's high", preview.dayHigh],
    ['52-week low', preview.fiftyTwoWeekLow],
    ['52-week high', preview.fiftyTwoWeekHigh]
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value === null ? '—' : value.toFixed(2);
    stats.append(dt, dd);
  }
  return stats;
}

function targetRow(input: HTMLInputElement): HTMLElement {
  const label = document.createElement('label');
  label.className = 'modal-field';
  label.textContent = 'Target price';
  label.append(input);
  return label;
}

function actionRow(preview: SymbolPreview, finish: (a: DetailOutcome['action']) => void): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = preview.onWatchlist ? 'Close' : 'Cancel';
  cancel.addEventListener('click', () => finish('none'));
  actions.append(cancel);

  if (preview.onWatchlist) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => finish('remove'));
    // Saving the edited target is the primary action for a ticker already added.
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn-primary';
    save.textContent = 'Save target';
    save.addEventListener('click', () => finish('add'));
    actions.append(remove, save);
  } else {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-primary';
    add.textContent = 'Add ticker';
    add.addEventListener('click', () => finish('add'));
    actions.append(add);
  }
  return actions;
}

function loadingFrame(symbol: string): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'detail-loading';
  const title = document.createElement('h2');
  title.className = 'detail-symbol';
  title.textContent = symbol;
  const note = document.createElement('p');
  note.className = 'detail-name';
  note.textContent = 'Loading a year of prices…';
  frame.append(title, note);
  return frame;
}

function errorFrame(symbol: string, message: string): HTMLElement {
  const frame = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'detail-symbol';
  title.textContent = symbol;
  const note = document.createElement('p');
  note.className = 'modal-body';
  note.textContent = `Could not load details: ${message}`;
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn js-close';
  close.textContent = 'Close';
  actions.append(close);
  frame.append(title, note, actions);
  return frame;
}
