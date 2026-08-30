/**
 * Served as a string so the same sheet can be adopted by the content script's
 * shadow root and linked into the new-tab and options pages.
 */
export const TICKER_CSS = `
:host {
  all: initial;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.bar {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  overflow: hidden;
  /* Porcelain */
  background: #f6f4f1;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  color: #1f2328;
  user-select: none;
  cursor: default;
}

.viewport {
  flex: 1 1 auto;
  overflow: hidden;
  display: flex;
}

.track {
  display: flex;
  flex: 0 0 auto;
  will-change: transform;
}

/* Two identical groups make the wrap-around seamless: by the time the first has
   scrolled fully out, the second sits exactly where it started. */
.track.is-scrolling {
  animation: stock-ticker-marquee linear infinite;
}

.bar:hover .track.is-scrolling {
  animation-play-state: paused;
}

@media (prefers-reduced-motion: reduce) {
  .track.is-scrolling {
    animation: none;
  }
  .viewport {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .viewport::-webkit-scrollbar {
    display: none;
  }
}

.group {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

.card {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 14px;
  white-space: nowrap;
  line-height: 1;
}

.symbol {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #1f2328;
}

.prices {
  font-size: 11px;
  font-weight: 400;
  color: #5f6368;
  font-variant-numeric: tabular-nums;
}

.sparkline {
  display: block;
  flex: 0 0 auto;
}

.card.is-pending .prices {
  color: #9aa0a6;
}

@keyframes stock-ticker-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
`;
