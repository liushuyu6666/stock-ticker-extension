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
  private readonly stampLabel: HTMLElement;
  private readonly stampValue: HTMLElement;
  private state: FreshnessState = { updatedAt: 0, attemptedAt: 0, error: null, hasRows: false };

  constructor(private readonly host: HTMLElement) {
    this.countdown = document.createElement('p');
    this.countdown.className = 'freshness-countdown';

    this.stamp = document.createElement('p');
    this.stamp.className = 'freshness-stamp';
    this.stampLabel = document.createElement('span');
    this.stampLabel.className = 'freshness-stamp-label';
    this.stampValue = document.createElement('span');
    this.stampValue.className = 'freshness-stamp-value';
    this.stamp.append(this.stampLabel, this.stampValue);

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
      this.stampLabel.textContent = '';
      this.stampValue.textContent = '';
      return;
    }

    const now = Date.now();
    const stale = isStale(updatedAt, now);
    const bad = stale || error !== null;

    // A zero here is not "about to happen" — it is "the last attempt is more
    // than a period behind", which is worth saying in words. A frozen 0:00 reads
    // as a broken clock.
    const remaining = msUntilNextRefresh(attemptedAt, now);
    this.countdown.textContent =
      remaining > 0 ? `next refresh ${formatCountdown(remaining)}` : 'refresh due';
    this.countdown.className = bad ? 'freshness-countdown is-bad' : 'freshness-countdown';
    this.countdown.title = error
      ? `The last poll failed: ${error}`
      : 'Counting down to the next automatic price refresh.';

    this.stampLabel.textContent = 'last update';
    this.stampValue.textContent = updatedAt > 0 ? formatIsoLocal(updatedAt) : 'never';
    this.stamp.className = bad || updatedAt <= 0 ? 'freshness-stamp is-bad' : 'freshness-stamp';
    if (updatedAt <= 0) return;
    this.stamp.title = stale
      ? `No successful refresh for ${formatAge(now - updatedAt)} — these are the last known prices.`
      : 'When prices last arrived.';
  }
}
