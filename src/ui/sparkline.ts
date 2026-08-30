import type { Trend } from '../shared/types';

export const SPARKLINE_WIDTH = 46;
export const SPARKLINE_HEIGHT = 14;

/** Above target reads red, at or below target reads green. */
export const TREND_COLORS: Record<Trend, string> = {
  above: '#d93025',
  atOrBelow: '#188038'
};

const SVG_NS = 'http://www.w3.org/2000/svg';
/**
 * Chosen by rendering a year of real closes at 14/20/28/40/64 points: above ~28
 * the line reads as noise at 46px wide, below it the year's actual shape starts
 * collapsing. This is the "simplified" in a simplified trend line.
 */
const MAX_POINTS = 28;
const VERTICAL_PADDING = 1.5;

/**
 * Pure geometry: closes in, SVG path data out. Kept free of the DOM so the
 * normalisation is trivially testable.
 */
export function sparklinePath(
  closes: number[],
  width = SPARKLINE_WIDTH,
  height = SPARKLINE_HEIGHT
): string {
  const points = downsample(closes, MAX_POINTS);
  if (points.length === 0) return '';
  if (points.length === 1) {
    const mid = round(height / 2);
    return `M 0 ${mid} L ${round(width)} ${mid}`;
  }

  let min = Infinity;
  let max = -Infinity;
  for (const value of points) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const usable = height - VERTICAL_PADDING * 2;
  // A flat year would divide by zero; draw it down the middle instead.
  const span = max - min;
  const yFor = (value: number): number =>
    span === 0
      ? height / 2
      : VERTICAL_PADDING + (1 - (value - min) / span) * usable;

  const step = width / (points.length - 1);
  return points
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${round(index * step)} ${round(yFor(value))}`)
    .join(' ');
}

/** Builds the <svg> a card renders. No axes, labels, grid, or point markers. */
export function createSparkline(closes: number[], trend: Trend): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('viewBox', `0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`);
  svg.setAttribute('width', String(SPARKLINE_WIDTH));
  svg.setAttribute('height', String(SPARKLINE_HEIGHT));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', sparklinePath(closes));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', TREND_COLORS[trend]);
  path.setAttribute('stroke-width', '1');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  // Vector-effect keeps the stroke 1px after the non-uniform viewBox scaling.
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  return svg;
}

/** Evenly samples the series down to at most `limit` points, keeping the last. */
function downsample(values: number[], limit: number): number[] {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length <= limit) return clean;
  const step = (clean.length - 1) / (limit - 1);
  const sampled: number[] = [];
  for (let i = 0; i < limit; i += 1) sampled.push(clean[Math.round(i * step)]);
  return sampled;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
