import type { Request, Response } from '../shared/messages';
import type { HistoryStore } from './HistoryStore';
import type { RefreshScheduler } from './RefreshScheduler';
import type { SymbolSearch } from './SymbolSearch';
import type { TickerService } from './TickerService';
import type { WatchlistRepository } from './WatchlistRepository';

/** Single entry point for everything the UI surfaces ask of the worker. */
export class MessageRouter {
  /** The dropdown shows at most this many candidates. */
  private static readonly SEARCH_LIMIT = 7;

  constructor(
    private readonly ticker: TickerService,
    private readonly watchlist: WatchlistRepository,
    private readonly scheduler: RefreshScheduler,
    private readonly search: SymbolSearch,
    private readonly history: HistoryStore
  ) {}

  /**
   * Returns true when a response is pending, which is what tells Chrome to keep
   * the message channel open for the async reply.
   */
  handle(request: Request, sendResponse: (response: Response) => void): boolean {
    this.dispatch(request)
      .then(sendResponse)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[stock-ticker][MessageRouter][handle] request failed', {
          type: request?.type,
          message
        });
        sendResponse({ ok: false, error: message });
      });
    return true;
  }

  private async dispatch(request: Request): Promise<Response> {
    switch (request.type) {
      case 'GET_SNAPSHOT': {
        // Any surface asking for rows is proof a bar is on screen.
        await this.scheduler.noteConsumerSeen();
        const snapshot = await this.ticker.readSnapshot();
        // A cold worker has nothing cached; fetch once so the bar is never blank.
        if (snapshot.rows.length === 0) {
          await this.scheduler.syncHistory();
          return { ok: true, snapshot: await this.ticker.refreshQuotes() };
        }
        return { ok: true, snapshot };
      }

      case 'GET_WATCHLIST':
        return { ok: true, entries: await this.watchlist.list() };

      case 'SEARCH_SYMBOLS':
        return { ok: true, matches: await this.search.search(request.query, MessageRouter.SEARCH_LIMIT) };

      case 'ADD_SYMBOL': {
        const added = await this.watchlist.add(request.match, request.targetPrice);
        if (!added) return { ok: false, error: `${request.match.symbol} is already on the watchlist` };
        // The user is watching the card appear, so backfill now rather than
        // leaving an empty sparkline until the next hourly gap check.
        await this.scheduler.syncHistory();
        return { ok: true, snapshot: await this.ticker.refreshQuotes() };
      }

      case 'REMOVE_SYMBOL': {
        await this.watchlist.remove(request.symbol);
        // Reclaim the series immediately; nothing references it any more.
        await this.history.remove(request.symbol);
        // Dropping a row needs no fresh prices for the rows that remain.
        return { ok: true, snapshot: await this.ticker.rebuild() };
      }

      case 'SET_TARGET': {
        await this.watchlist.setTarget(request.symbol, request.targetPrice);
        // A target is the user's own number; it changes which side of the line
        // the row falls on, not what the market says. Re-join locally.
        return { ok: true, snapshot: await this.ticker.rebuild() };
      }

      case 'REFRESH_NOW': {
        await this.scheduler.syncHistory();
        return { ok: true, snapshot: await this.ticker.refreshQuotes() };
      }

      case 'OPEN_CONFIG': {
        // openOptionsPage may focus an existing tab; the config page is a
        // destination the user asked for, so always give them a fresh tab.
        await chrome.tabs.create({ url: chrome.runtime.getURL('config.html') });
        return { ok: true };
      }

      default:
        return {
          ok: false,
          error: `unknown request type (actual=${String((request as { type?: string })?.type)})`
        };
    }
  }
}
