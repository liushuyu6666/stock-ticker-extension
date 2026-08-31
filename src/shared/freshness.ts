/**
 * How old a price is allowed to get before the UI stops presenting it as live.
 *
 * Three polls deep, and it has to be expressed that way rather than as a flat
 * number: a threshold at or below the poll period would leave the bar dimmed
 * for most of every cycle, since a snapshot is by definition almost a full
 * period old just before the next one lands. Three missed polls is a condition;
 * one is a late alarm.
 */
export const STALE_AFTER_MS = 3 * 10 * 60 * 1000;

/**
 * The quote poll's period, shared rather than duplicated, so the scheduler that
 * sets the alarm and the clock that counts down to it cannot drift apart.
 * Chrome clamps alarm periods to a one-minute floor; this sits well above it,
 * because Yahoo's own quotes are ~15 min delayed and polling far inside that
 * window buys freshness the upstream does not actually have.
 */
export const QUOTE_PERIOD_MS = 10 * 60 * 1000;

/**
 * How often a mounted surface re-announces itself to the worker.
 *
 * Deliberately *not* the poll period. The worker polls only while some surface
 * has spoken up recently, so the announcement has to be several times finer
 * than the window it keeps open — announcing once per poll period would race
 * that window and drop polls whenever the two clocks drifted apart.
 */
export const SURFACE_HEARTBEAT_MS = 60 * 1000;

/** A snapshot that has never been written is not stale — it is simply absent. */
export function isStale(updatedAt: number, now: number = Date.now()): boolean {
  if (!isTimestamp(updatedAt)) return false;
  return now - updatedAt >= STALE_AFTER_MS;
}

/**
 * Guards both helpers below against a field that is not there. A snapshot
 * written before `attemptedAt` existed still sits in storage after an update,
 * and arithmetic on `undefined` renders as `NaN:NaN` rather than failing.
 */
function isTimestamp(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Milliseconds until the poll should next publish. Clamped at both ends: the
 * alarm can fire a little late, and a clock that counts into negative numbers
 * tells the user nothing.
 */
export function msUntilNextRefresh(updatedAt: number, now: number = Date.now()): number {
  if (!isTimestamp(updatedAt)) return 0;
  const remaining = updatedAt + QUOTE_PERIOD_MS - now;
  return Math.min(Math.max(remaining, 0), QUOTE_PERIOD_MS);
}

/** `0:47` — a countdown, so seconds are always two digits. */
export function formatCountdown(ms: number): string {
  const seconds = Number.isFinite(ms) ? Math.ceil(ms / 1000) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** `12 min` — coarse on purpose, since this is read at a glance. */
export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour' : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * `2026-08-31T04:12:33-04:00` — ISO 8601 in the reader's own timezone.
 *
 * `Date.prototype.toISOString` would be shorter but always renders UTC, which
 * makes "when did this last update?" a subtraction the reader has to do in
 * their head. The offset is spelled out so the timestamp is unambiguous.
 */
export function formatIsoLocal(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number, width = 2): string => String(Math.abs(value)).padStart(width, '0');
  // getTimezoneOffset is minutes *behind* UTC, so its sign is inverted here.
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  );
}
