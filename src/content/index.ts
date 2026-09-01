import { STORAGE_KEYS } from '../shared/messages';
import { HIDDEN_SITE_DEFAULTS, isHiddenSite } from '../shared/sites';
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

/**
 * Read straight from storage rather than through the worker: this runs on every
 * page load, and waking a suspended service worker to answer one question would
 * put a message round trip in front of every navigation.
 */
async function hiddenHere(): Promise<boolean> {
  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEYS.hiddenSites);
    const sites = stored[STORAGE_KEYS.hiddenSites];
    return isHiddenSite(location.hostname, Array.isArray(sites) ? sites : HIDDEN_SITE_DEFAULTS);
  } catch {
    // Storage unavailable (a torn-down extension context); showing the bar is
    // the safer failure, since hiding it silently looks like a broken install.
    return false;
  }
}

/** Takes the strip back off the page, and the space it reserved with it. */
function unmount(): void {
  document.getElementById(HOST_ID)?.remove();
  document.documentElement.style.removeProperty('margin-top');
}

async function start(): Promise<void> {
  if (await hiddenHere()) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}

// Adding the site you are looking at should hide the bar there and then, not on
// the next reload — and removing it should bring the bar back the same way.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes[STORAGE_KEYS.hiddenSites]) return;
  void hiddenHere().then((hidden) => (hidden ? unmount() : mount()));
});

void start();
