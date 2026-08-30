import type { SymbolMatch } from '../shared/types';
import type { SymbolSearch } from './SymbolSearch';

const SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';

/**
 * Yahoo's search endpoint, which honours `quotesCount` exactly — so the
 * dropdown's cap is enforced upstream rather than by slicing a longer list.
 * Free and keyless, and undocumented like the rest of the Yahoo surface.
 */
export class YahooSymbolSearch implements SymbolSearch {
  async search(query: string, limit: number): Promise<SymbolMatch[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const url =
      `${SEARCH_URL}?q=${encodeURIComponent(trimmed)}` +
      `&quotesCount=${limit}&newsCount=0&listsCount=0&enableFuzzyQuery=false`;

    const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) {
      throw new Error(
        `[stock-ticker][YahooSymbolSearch][search] upstream rejected the request (status=${response.status} query=${trimmed})`
      );
    }

    const body = await response.json();
    const quotes = body?.quotes;
    if (!Array.isArray(quotes)) return [];

    return quotes
      .filter((quote: RawQuote) => typeof quote?.symbol === 'string' && quote.symbol.length > 0)
      .map((quote: RawQuote) => ({
        symbol: quote.symbol,
        // longname is fuller but absent on some instruments; shortname always is.
        name: quote.longname ?? quote.shortname ?? quote.symbol,
        exchange: quote.exchDisp ?? quote.exchange ?? '',
        type: quote.typeDisp ?? quote.quoteType ?? ''
      }));
  }
}

interface RawQuote {
  symbol: string;
  longname?: string;
  shortname?: string;
  exchDisp?: string;
  exchange?: string;
  typeDisp?: string;
  quoteType?: string;
}
