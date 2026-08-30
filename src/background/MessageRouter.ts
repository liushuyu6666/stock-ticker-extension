import type { Request, Response } from '../shared/messages';
import type { RefreshScheduler } from './RefreshScheduler';
import type { TickerService } from './TickerService';
import type { WatchlistRepository } from './WatchlistRepository';

/** Single entry point for everything the UI surfaces ask of the worker. */
export class MessageRouter {
  constructor(
    private readonly ticker: TickerService,
    private readonly watchlist: WatchlistRepository,
    private readonly scheduler: RefreshScheduler
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
        // Any bar asking for rows is proof a bar is on screen.
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
      case 'SAVE_WATCHLIST': {
        await this.watchlist.save(request.entries);
        // New symbols need a backfill before their sparkline can render.
        await this.scheduler.syncHistory();
        await this.ticker.refreshQuotes();
        return { ok: true };
      }
      case 'REFRESH_NOW': {
        await this.scheduler.syncHistory();
        return { ok: true, snapshot: await this.ticker.refreshQuotes() };
      }
      default:
        return { ok: false, error: `unknown request type (actual=${String((request as { type?: string })?.type)})` };
    }
  }
}
