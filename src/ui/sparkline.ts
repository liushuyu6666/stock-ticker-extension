import { downsampleSeries } from '../shared/series';
import type { Trend } from '../shared/types';

const SPARKLINE_WIDTH = 46;
const SPARKLINE_HEIGHT = 14;

/** Above target reads red, at or below target reads green. */
const TREND_COLORS: Record<Trend, string> = {
  above: '#d93025',
  atOrBelow: '#188038'
};

const SVG_NS = 'http://www.w3.org/2000/svg';
/**
 * Default budget, for the 46px bar sparkline. Chosen by rendering a year of real
 * closes at 14/20/28/40/64: above ~28 the line reads as noise at that width,
 * below it the year's shape starts collapsing. Larger sizes pass their own.
 */
const MAX_POINTS = 28;
const VERTICAL_PADDING = 1.5;

/**
 * Pure geometry: closes in, SVG path data out. Kept free of the DOM so the
 * normalisation is trivially testable.
 */
/**
 * Where each drawn point lands, as fractions of the box. Shared with the path
 * builder so an overlay — the detail dialog's crosshair — can sit exactly on
 * the line without re-deriving the normalisation and drifting from it.
 */
export interface SparklineGeometry {
  /** The values actually drawn, after downsampling. */
  points: number[];
  /** 0 at the left edge, 1 at the right. */
  xFraction(index: number): number;
  /** 0 at the top edge, 1 at the bottom. */
  yFraction(index: number): number;
}

export function sparklineGeometry(
  closes: number[],
  maxPoints = MAX_POINTS,
  height = SPARKLINE_HEIGHT
): SparklineGeometry {
  const points = downsampleSeries(closes, maxPoints);

  let min = Infinity;
  let max = -Infinity;
  for (const value of points) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const usable = height - VERTICAL_PADDING * 2;
  // A flat year would divide by zero; draw it down the middle instead.
  const span = max - min;

  return {
    points,
    // A single point has no span to sit along, so it centres.
    xFraction: (index) => (points.length < 2 ? 0.5 : index / (points.length - 1)),
    yFraction: (index) => {
      if (points.length === 0 || span === 0) return 0.5;
      const y = VERTICAL_PADDING + (1 - (points[index] - min) / span) * usable;
      return y / height;
    }
  };
}

export function sparklinePath(
  closes: number[],
  width = SPARKLINE_WIDTH,
  height = SPARKLINE_HEIGHT,
  maxPoints = MAX_POINTS
): string {
  const geometry = sparklineGeometry(closes, maxPoints, height);
  const { points } = geometry;
  if (points.length === 0) return '';
  if (points.length === 1) {
    const mid = round(height / 2);
    return `M 0 ${mid} L ${round(width)} ${mid}`;
  }

  return points
    .map(
      (_, index) =>
        `${index === 0 ? 'M' : 'L'} ${round(geometry.xFraction(index) * width)} ${round(
          geometry.yFraction(index) * height
        )}`
    )
    .join(' ');
}

export interface SparklineSize {
  width: number;
  height: number;
  /** Omit the width/height attributes so CSS can stretch the svg. */
  fluid?: boolean;
  /**
   * Point budget for this size. Not derived from width: the legible density is
   * sub-linear, so 46px wants 28 points while 260px wants ~70, not ~158.
   */
  points?: number;
}

/** Builds the <svg> a card renders. No axes, labels, grid, or point markers. */
export function createSparkline(
  closes: number[],
  trend: Trend,
  size: SparklineSize = { width: SPARKLINE_WIDTH, height: SPARKLINE_HEIGHT }
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
  if (!size.fluid) {
    svg.setAttribute('width', String(size.width));
    svg.setAttribute('height', String(size.height));
  }
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', sparklinePath(closes, size.width, size.height, size.points ?? MAX_POINTS));
  path.setAttribute('fill', 'none');
  // The svg stretches to its box, so without this the stroke stretches too and
  // horizontal runs come out fatter than vertical ones.
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.setAttribute('stroke', TREND_COLORS[trend]);
  path.setAttribute('stroke-width', '1');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  // Vector-effect keeps the stroke 1px after the non-uniform viewBox scaling.
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  return svg;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
