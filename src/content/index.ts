import { TICKER_CSS } from '../ui/styles';
import { TickerBar } from '../ui/TickerBar';
import { TickerClient } from '../ui/TickerClient';

const HOST_ID = 'stock-ticker-extension-host';
const BAR_HEIGHT_PX = 28;

/**
 * Injects the bar at the top of ordinary web pages. Everything lives inside a
 * shadow root so the page's CSS cannot reach our styles and ours cannot leak
 * into the page.
 */
function mount(): void {
  // Guard against double injection on extension reload or SPA re-entry.
  if (document.getElementById(HOST_ID)) return;
  // XML, plain-text and image documents have no useful place to put a bar.
  if (!(document.documentElement instanceof HTMLElement)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'width:100%',
    `height:${BAR_HEIGHT_PX}px`,
    'z-index:2147483647',
    'margin:0',
    'padding:0',
    'pointer-events:auto',
    'color-scheme:light'
  ].join(';');

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = TICKER_CSS;

  const bar = new TickerBar();
  shadow.append(style, bar.element);
  document.documentElement.append(host);

  pushPageDown();

  const client = new TickerClient();
  client.subscribe((snapshot) => bar.update(snapshot.rows, snapshot.updatedAt));

  // Clicking anywhere on the bar is the way into the config page.
  bar.element.addEventListener('click', () => void client.openConfig());
}

/**
 * Reserves the strip by shifting the document down. Sites with their own
 * position:fixed header still paint at viewport top and will overlap the bar —
 * a generic fix is not possible, so those need a per-site tweak.
 */
function pushPageDown(): void {
  document.documentElement.style.setProperty('margin-top', `${BAR_HEIGHT_PX}px`, 'important');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
