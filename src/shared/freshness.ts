/**
 * How old a price is allowed to get before the UI stops presenting it as live.
 *
 * The poll runs every minute, so a snapshot older than that means an attempt
 * failed, was throttled upstream, or never ran at all — but a single missed
 * minute is noise, not news. Ten minutes is deliberately an order of magnitude
 * above the poll: long enough that a transient hiccup self-heals without the
 * bar flickering, short enough that a genuinely stuck price is called out while
 * it still matters.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * The quote poll's period, shared rather than duplicated, so the scheduler that
 * sets the alarm and the clock that counts down to it cannot drift apart.
 * Chrome clamps alarm periods to one minute; this is that floor.
 */
export const QUOTE_PERIOD_MS = 60 * 1000;

/** A snapshot that has never been written is not stale — it is simply absent. */
export function isStale(updatedAt: number, now: number = Date.now()): boolean {
  if (updatedAt <= 0) return false;
  return now - updatedAt >= STALE_AFTER_MS;
}

/**
 * Milliseconds until the poll should next publish. Clamped at both ends: the
 * alarm can fire a little late, and a clock that counts into negative numbers
 * tells the user nothing.
 */
export function msUntilNextRefresh(updatedAt: number, now: number = Date.now()): number {
  if (updatedAt <= 0) return 0;
  const remaining = updatedAt + QUOTE_PERIOD_MS - now;
  return Math.min(Math.max(remaining, 0), QUOTE_PERIOD_MS);
}

/** `0:47` — a countdown, so seconds are always two digits. */
export function formatCountdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
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
