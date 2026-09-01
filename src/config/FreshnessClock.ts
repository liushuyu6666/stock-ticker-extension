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

  private readonly row: HTMLElement;
  private readonly label: HTMLElement;
  private readonly value: HTMLElement;
  private readonly stamp: HTMLElement;
  private readonly stampValue: HTMLElement;
  private state: FreshnessState = { updatedAt: 0, attemptedAt: 0, error: null, hasRows: false };

  constructor(private readonly host: HTMLElement) {
    this.label = document.createElement('span');
    this.label.className = 'freshness-label';
    this.value = document.createElement('span');
    this.value.className = 'freshness-value';

    this.row = document.createElement('div');
    this.row.className = 'freshness-row';
    this.row.append(this.label, this.value);

    this.stampValue = document.createElement('span');
    this.stampValue.className = 'freshness-stamp-value';
    this.stamp = document.createElement('p');
    this.stamp.className = 'freshness-stamp';
    const stampLabel = document.createElement('span');
    stampLabel.className = 'freshness-stamp-label';
    stampLabel.textContent = 'last update';
    this.stamp.append(stampLabel, this.stampValue);

    this.host.append(this.row, this.stamp);
    setInterval(() => this.paint(), FreshnessClock.TICK_MS);
    this.paint();
  }

  set(state: FreshnessState): void {
    this.state = state;
    this.paint();
  }

  /** Called while a manual refresh is in flight, so the countdown does not tick on. */
  markRefreshing(): void {
    this.label.textContent = 'refreshing';
    this.value.textContent = '…';
  }

  private paint(): void {
    const { updatedAt, attemptedAt, error, hasRows } = this.state;
    // Nothing on the watchlist means nothing is polled, so a countdown would be
    // counting towards a refresh that will never happen.
    this.host.hidden = !hasRows;
    if (!hasRows) return;

    const now = Date.now();
    const stale = isStale(updatedAt, now);
    const bad = stale || error !== null;
    const remaining = msUntilNextRefresh(attemptedAt, now);

    // A run-out countdown is not "imminent" — it is "the last attempt is more
    // than a period behind", so the state moves into the label and the value
    // stops pretending to be a number.
    if (remaining > 0) {
      this.label.textContent = 'next refresh';
      this.value.textContent = formatCountdown(remaining);
    } else {
      this.label.textContent = 'refresh due';
      this.value.textContent = '—';
    }

    this.row.className = bad || remaining === 0 ? 'freshness-row is-bad' : 'freshness-row';
    this.row.title = error
      ? `The last poll failed: ${error}`
      : 'Counting down to the next automatic price refresh.';

    this.stampValue.textContent = updatedAt > 0 ? formatIsoLocal(updatedAt) : 'never';
    this.stamp.className = bad || updatedAt <= 0 ? 'freshness-stamp is-bad' : 'freshness-stamp';
    this.stamp.title = stale
      ? `No successful refresh for ${formatAge(now - updatedAt)} — these are the last known prices.`
      : 'When prices last arrived.';
  }
}
