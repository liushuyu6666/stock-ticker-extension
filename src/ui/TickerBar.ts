import { isStale } from '../shared/freshness';
import type { TickerRow } from '../shared/types';
import { StockCard } from './StockCard';

/**
 * Owns the bar's DOM and its marquee. Rendering is idempotent — `update` can be
 * called on every snapshot without the animation restarting.
 */
export class TickerBar {
  /** Pixels per second the marquee travels. Slow enough to actually read. */
  private static readonly SPEED_PX_PER_SECOND = 40;
  /**
   * Staleness arrives with the passage of time, not with a new snapshot — and
   * when a refresh fails repeatedly the worker stops writing at all, so nothing
   * would wake the bar. Hence a clock of its own.
   */
  private static readonly FRESHNESS_TICK_MS = 15_000;

  private readonly bar: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly track: HTMLElement;
  private signature = '';
  private updatedAt = 0;

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

    // The number of copies needed depends on the viewport width, so a resize
    // (or the window being maximised) has to recompute it or a gap opens up.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.scheduleMarquee()).observe(this.viewport);
    }

    setInterval(() => this.applyFreshness(), TickerBar.FRESHNESS_TICK_MS);
  }

  get element(): HTMLElement {
    return this.bar;
  }

  update(rows: TickerRow[], updatedAt: number): void {
    // Applied before the early return below: when a refresh fails the rows are
    // republished unchanged, and it is precisely then that the dimming matters.
    this.updatedAt = updatedAt;
    this.applyFreshness();

    // Re-rendering identical rows would restart the animation mid-scroll.
    const next = signatureOf(rows);
    if (next === this.signature) return;
    this.signature = next;

    this.track.classList.remove('is-scrolling');
    this.track.replaceChildren();
    if (rows.length === 0) return;

    // Only the first group is built here. How many copies follow depends on
    // measurements that are not available until this one has been laid out.
    this.track.append(buildGroup(rows));
    this.scheduleMarquee();
  }

  /**
   * Dims the whole strip once the prices behind it stop being live, so a frozen
   * number is distinguishable from a quiet market. A closed exchange and a
   * throttled endpoint look identical otherwise.
   */
  private applyFreshness(): void {
    this.bar.classList.toggle('is-stale', isStale(this.updatedAt));
  }

  /** Measurement has to wait for layout, or every width reads as zero. */
  private scheduleMarquee(): void {
    requestAnimationFrame(() => this.applyMarquee());
  }

  /**
   * Fills the track with as many copies of the row set as the loop needs, then
   * scrolls it by exactly one copy's width.
   *
   * Translating by a fixed -50% only reads as seamless when a single copy is
   * already wider than the viewport. Below that — seven tickers on a wide
   * monitor, say — the wrap would snap back to a half-empty strip, which is why
   * the bar previously stalled instead of scrolling.
   */
  private applyMarquee(): void {
    const group = this.track.firstElementChild as HTMLElement | null;
    if (!group) return;

    const groupWidth = group.getBoundingClientRect().width;
    const viewportWidth = this.viewport.getBoundingClientRect().width;
    // Not laid out yet (a hidden tab, say); the resize observer will call back.
    if (groupWidth === 0) return;

    // One copy to fill what is visible, plus one more to scroll in behind it.
    const copies = Math.ceil(viewportWidth / groupWidth) + 1;
    while (this.track.children.length < copies) {
      const clone = group.cloneNode(true) as HTMLElement;
      // Screen readers should hear the row set once, not once per copy.
      clone.setAttribute('aria-hidden', 'true');
      this.track.append(clone);
    }

    this.track.style.setProperty('--marquee-distance', `${groupWidth}px`);
    this.track.style.animationDuration = `${(groupWidth / TickerBar.SPEED_PX_PER_SECOND).toFixed(2)}s`;
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
