import { formatAge, formatCountdown, isStale, msUntilNextRefresh } from '../shared/freshness';

/**
 * The little line under the brand. It answers one question — "is what I am
 * looking at current?" — in the only two ways that question has an answer:
 * counting down to the next refresh while things are healthy, and naming the
 * age of the prices once they have stopped arriving.
 */
export class FreshnessClock {
  /** A countdown that does not tick every second is just a stale label. */
  private static readonly TICK_MS = 1000;

  private updatedAt = 0;
  private hasRows = false;

  constructor(private readonly host: HTMLElement) {
    setInterval(() => this.paint(), FreshnessClock.TICK_MS);
  }

  /** Called on every snapshot; the clock runs itself between them. */
  set(updatedAt: number, hasRows: boolean): void {
    this.updatedAt = updatedAt;
    this.hasRows = hasRows;
    this.paint();
  }

  private paint(): void {
    // Nothing on the watchlist means nothing is being polled, so a countdown
    // would be counting towards a refresh that will never happen.
    if (!this.hasRows || this.updatedAt <= 0) {
      this.host.textContent = '';
      this.host.className = 'brand-clock';
      this.host.removeAttribute('title');
      return;
    }

    const now = Date.now();
    if (isStale(this.updatedAt, now)) {
      this.host.textContent = `prices ${formatAge(now - this.updatedAt)} old`;
      this.host.className = 'brand-clock is-stale';
      this.host.title = 'No successful refresh recently — these are the last known prices.';
      return;
    }

    this.host.textContent = `next refresh ${formatCountdown(msUntilNextRefresh(this.updatedAt, now))}`;
    this.host.className = 'brand-clock';
    this.host.title = `Prices last updated at ${new Date(this.updatedAt).toLocaleTimeString()}`;
  }
}
