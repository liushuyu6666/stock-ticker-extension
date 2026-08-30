import type { TickerRow } from '../shared/types';
import { StockCard } from './StockCard';

/**
 * Owns the bar's DOM and its marquee. Rendering is idempotent — `update` can be
 * called on every snapshot without the animation restarting.
 */
export class TickerBar {
  /** Pixels per second the marquee travels. Slow enough to actually read. */
  private static readonly SPEED_PX_PER_SECOND = 40;

  private readonly bar: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly track: HTMLElement;
  private signature = '';

  constructor() {
    this.bar = document.createElement('div');
    this.bar.className = 'bar';
    this.bar.setAttribute('role', 'marquee');
    this.bar.setAttribute('aria-label', 'Stock ticker');

    this.viewport = document.createElement('div');
    this.viewport.className = 'viewport';

    this.track = document.createElement('div');
    this.track.className = 'track';

    this.viewport.append(this.track);
    this.bar.append(this.viewport);
  }

  get element(): HTMLElement {
    return this.bar;
  }

  update(rows: TickerRow[]): void {
    // Re-rendering identical rows would restart the animation mid-scroll.
    const next = signatureOf(rows);
    if (next === this.signature) return;
    this.signature = next;

    this.track.replaceChildren();
    if (rows.length === 0) return;

    const primary = buildGroup(rows);
    // The duplicate is what makes the loop seamless; hide it from assistive tech.
    const duplicate = buildGroup(rows);
    duplicate.setAttribute('aria-hidden', 'true');
    this.track.append(primary, duplicate);

    // Measurement has to wait for layout, or every width reads as zero.
    requestAnimationFrame(() => this.applyMarquee(primary));
  }

  private applyMarquee(group: HTMLElement): void {
    const groupWidth = group.getBoundingClientRect().width;
    const viewportWidth = this.viewport.getBoundingClientRect().width;

    // Everything fits — scrolling a full list past the eye would be noise.
    if (groupWidth === 0 || groupWidth <= viewportWidth) {
      this.track.classList.remove('is-scrolling');
      this.track.style.animationDuration = '';
      return;
    }

    const seconds = groupWidth / TickerBar.SPEED_PX_PER_SECOND;
    this.track.style.animationDuration = `${seconds.toFixed(2)}s`;
    this.track.classList.add('is-scrolling');
  }
}

function buildGroup(rows: TickerRow[]): HTMLElement {
  const group = document.createElement('div');
  group.className = 'group';
  for (const row of rows) group.append(StockCard.render(row));
  return group;
}

function signatureOf(rows: TickerRow[]): string {
  return rows
    .map((row) => `${row.symbol}:${row.price ?? ''}:${row.targetPrice}:${row.closes.length}`)
    .join('|');
}
