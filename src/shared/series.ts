/**
 * Points kept per symbol in the published snapshot. No surface draws more than
 * this (the bar uses 28, the config card 70), so carrying the full series would
 * be storing detail nothing can render. The complete series stays in the
 * history store, which remains the source of truth for anything that needs it.
 */
export const SNAPSHOT_SERIES_POINTS = 70;

/**
 * One trading year plus a fortnight of slack. Sized to the sparkline's actual
 * span: a US year is ~252 sessions, so anything beyond this is history the
 * one-year chart would never show.
 */
export const MAX_HISTORY_BARS = 260;

/** Evenly samples down to at most `limit` points, always keeping first and last. */
export function downsampleSeries(values: number[], limit: number): number[] {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length <= limit) return clean;
  const step = (clean.length - 1) / (limit - 1);
  const sampled: number[] = [];
  for (let i = 0; i < limit; i += 1) sampled.push(clean[Math.round(i * step)]);
  return sampled;
}
