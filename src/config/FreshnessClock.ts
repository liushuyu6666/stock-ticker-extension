import { formatAge, formatCountdown, formatIsoLocal, isStale, msUntilNextRefresh } from '../shared/freshness';

export interface FreshnessState {
  /** Epoch ms of the last successful quote fetch. */
  updatedAt: number;
  /** Epoch ms of the last attempt, successful or not. */
  attemptedAt: number;
  /** Set when that last attempt failed. */
  error: string | null;
  hasRows: boolean;
}

/**
 * The freshness block in the page header: a countdown to the next quote poll,
 * and the timestamp of the last one that actually returned prices.
 *
 * Red means the same thing in both lines — what you are looking at did not come
 * from the last attempt — so a glance at the colour is enough, and the two lines
 * only say which kind of trouble it is.
 */
export class FreshnessClock {
  /** A countdown that does not tick every second is just a stale label. */
  private static readonly TICK_MS = 1000;

  private readonly countdown: HTMLElement;
  private readonly stamp: HTMLElement;
  private state: FreshnessState = { updatedAt: 0, attemptedAt: 0, error: null, hasRows: false };

  constructor(private readonly host: HTMLElement) {
    this.countdown = document.createElement('p');
    this.countdown.className = 'freshness-countdown';

    this.stamp = document.createElement('p');
    this.stamp.className = 'freshness-stamp';

    this.host.append(this.countdown, this.stamp);
    setInterval(() => this.paint(), FreshnessClock.TICK_MS);
    this.paint();
  }

  set(state: FreshnessState): void {
    this.state = state;
    this.paint();
  }

  /** Called while a manual refresh is in flight, so the countdown does not tick on. */
  markRefreshing(): void {
    this.countdown.textContent = 'refreshing…';
    this.countdown.className = 'freshness-countdown';
  }

  private paint(): void {
    const { updatedAt, attemptedAt, error, hasRows } = this.state;
    // Nothing on the watchlist means nothing is polled, so a countdown would be
    // counting towards a refresh that will never happen.
    if (!hasRows) {
      this.countdown.textContent = '';
      this.stamp.textContent = '';
      return;
    }

    const now = Date.now();
    const stale = isStale(updatedAt, now);
    const bad = stale || error !== null;

    this.countdown.textContent = `next refresh ${formatCountdown(msUntilNextRefresh(attemptedAt, now))}`;
    this.countdown.className = bad ? 'freshness-countdown is-bad' : 'freshness-countdown';
    this.countdown.title = error
      ? `The last poll failed: ${error}`
      : 'Counting down to the next automatic price refresh.';

    if (updatedAt <= 0) {
      this.stamp.textContent = 'last update — never';
      this.stamp.className = 'freshness-stamp is-bad';
      return;
    }
    this.stamp.textContent = `last update ${formatIsoLocal(updatedAt)}`;
    this.stamp.className = bad ? 'freshness-stamp is-bad' : 'freshness-stamp';
    this.stamp.title = stale
      ? `No successful refresh for ${formatAge(now - updatedAt)} — these are the last known prices.`
      : 'When prices last arrived.';
  }
}
