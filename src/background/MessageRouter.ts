import { QUOTE_PERIOD_MS } from '../shared/freshness';
import type { Request, Response } from '../shared/messages';
import { STORAGE_KEYS } from '../shared/messages';
import { HIDDEN_SITE_DEFAULTS, effectiveSites, normalizeSite, readEdits, toEdits } from '../shared/sites';
import type { HistoryStore } from './HistoryStore';
import type { QuoteProvider } from './QuoteProvider';
import type { RefreshScheduler } from './RefreshScheduler';
import type { SymbolSearch } from './SymbolSearch';
import type { TickerService } from './TickerService';
import type { WatchlistRepository } from './WatchlistRepository';

/** Single entry point for everything the UI surfaces ask of the worker. */
export class MessageRouter {
  /** The dropdown shows at most this many candidates. */
  private static readonly SEARCH_LIMIT = 7;
  /**
   * The results page asks the lookup endpoint for this many. The dropdown's
   * endpoint refuses to return more than seven no matter what it is asked.
   */
  private static readonly LOOKUP_LIMIT = 50;

  constructor(
    private readonly ticker: TickerService,
    private readonly watchlist: WatchlistRepository,
    private readonly scheduler: RefreshScheduler,
    private readonly search: SymbolSearch,
    private readonly history: HistoryStore,
    private readonly provider: QuoteProvider
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
        // The poll only runs while a surface is on screen, so a payload can be
        // arbitrarily overdue by the time one appears — the alarm fired into an
        // empty room and did nothing. Asking is itself the signal that someone
        // is watching again, so repair it here rather than leaving a countdown
        // that has already run out. One poll at most: a failed attempt still
        // advances `attemptedAt`, so the next caller sees a current payload.
        if (Date.now() - snapshot.attemptedAt >= QUOTE_PERIOD_MS) {
          return { ok: true, snapshot: await this.ticker.refreshQuotes() };
        }
        return { ok: true, snapshot };
      }

      case 'GET_HIDDEN_SITES':
        return { ok: true, sites: await readHiddenSites(), defaults: [...HIDDEN_SITE_DEFAULTS] };

      case 'SET_HIDDEN_SITES': {
        const sites = [...new Set(request.sites.map(normalizeSite).filter((site): site is string => site !== null))];
        await chrome.storage.sync.set({ [STORAGE_KEYS.hiddenSites]: toEdits(sites) });
        return { ok: true, sites, defaults: [...HIDDEN_SITE_DEFAULTS] };
      }

      case 'GET_WATCHLIST':
        return { ok: true, entries: await this.watchlist.list() };

      case 'SEARCH_SYMBOLS':
        return { ok: true, matches: await this.search.search(request.query, MessageRouter.SEARCH_LIMIT) };

      case 'LOOKUP_SYMBOLS':
        return { ok: true, matches: await this.search.lookup(request.query, MessageRouter.LOOKUP_LIMIT) };

      case 'PREVIEW_SYMBOL': {
        const symbol = request.symbol.toUpperCase();
        const preview = await this.provider.fetchPreview(symbol);
        // Told here rather than inferred in the UI, so the dialog knows whether
        // to offer Add or Remove without a second round trip.
        const entry = (await this.watchlist.list()).find((candidate) => candidate.symbol === symbol);
        return {
          ok: true,
          preview: { ...preview, onWatchlist: entry !== undefined, targetPrice: entry?.targetPrice ?? 0 }
        };
      }

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

      case 'IMPORT_WATCHLIST': {
        // Merged, never replaced: an import is a restore on a fresh install and
        // a top-up on a populated one, and only the first of those can assume
        // the file is the whole truth.
        const existing = await this.watchlist.list();
        const bySymbol = new Map(existing.map((entry) => [entry.symbol, entry]));
        for (const incoming of request.entries) {
          const current = bySymbol.get(incoming.symbol);
          if (current) current.targetPrice = incoming.targetPrice;
          else bySymbol.set(incoming.symbol, { ...incoming, order: bySymbol.size });
        }
        await this.watchlist.save([...bySymbol.values()]);
        // Anything newly added has no series yet, so backfill before publishing.
        await this.scheduler.syncHistory();
        return { ok: true, snapshot: await this.ticker.refreshQuotes() };
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

async function readHiddenSites(): Promise<string[]> {
  const stored = await chrome.storage.sync.get(STORAGE_KEYS.hiddenSites);
  return effectiveSites(readEdits(stored[STORAGE_KEYS.hiddenSites]));
}
