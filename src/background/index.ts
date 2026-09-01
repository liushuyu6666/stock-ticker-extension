import { LocalHistoryStore } from './LocalHistoryStore';
import { MessageRouter } from './MessageRouter';
import { RefreshScheduler } from './RefreshScheduler';
import { TickerService } from './TickerService';
import { WatchlistRepository } from './WatchlistRepository';
import { YahooQuoteProvider } from './YahooQuoteProvider';
import { YahooSymbolSearch } from './YahooSymbolSearch';

/**
 * Composition root. The worker is the only place that touches the network or
 * storage; every UI surface reaches it through MessageRouter.
 */
const provider = new YahooQuoteProvider();
const search = new YahooSymbolSearch();
const history = new LocalHistoryStore();
const watchlist = new WatchlistRepository();
const ticker = new TickerService(provider, history, watchlist);
const scheduler = new RefreshScheduler(ticker, provider, history, watchlist);
const router = new MessageRouter(ticker, watchlist, scheduler, search, history, provider);

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) =>
  router.handle(request, sendResponse)
);

chrome.alarms.onAlarm.addListener((alarm) => {
  void scheduler.handleAlarm(alarm).catch((error: unknown) => {
    console.error('[stock-ticker][background][alarm] refresh failed', {
      alarm: alarm.name,
      message: error instanceof Error ? error.message : String(error)
    });
  });
});

async function bootstrap(): Promise<void> {
  await scheduler.install();
  // Separately caught: a throttled or failing history fetch used to abort the
  // whole chain, so the browser started with no prices and a countdown that had
  // nothing behind it until the first alarm.
  await scheduler.syncHistory().catch((error: unknown) => {
    console.warn('[stock-ticker][background][bootstrap] history sync failed', {
      message: error instanceof Error ? error.message : String(error)
    });
  });
  await ticker.refreshQuotes();
}

chrome.runtime.onInstalled.addListener(() => {
  void bootstrap().catch((error: unknown) => {
    console.error('[stock-ticker][background][onInstalled] bootstrap failed', {
      message: error instanceof Error ? error.message : String(error)
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap().catch(() => {
    /* A failed startup refresh self-heals on the next alarm. */
  });
});

// The action button has no popup; treat a click as "open my config page".
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('config.html') });
});
