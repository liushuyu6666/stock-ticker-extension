import type { SymbolMatch } from '../shared/types';
import type { SymbolSearch } from './SymbolSearch';

const SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
const LOOKUP_URL = 'https://query1.finance.yahoo.com/v1/finance/lookup';

/**
 * Two endpoints, because one cannot do both jobs.
 *
 * `search` is the ranked shortlist behind the dropdown. It returns exactly
 * seven rows and ignores a larger `quotesCount` — verified against the live
 * endpoint — which is why the long list has to come from somewhere else.
 *
 * `lookup` is that somewhere else: it honours `count` into the dozens and
 * carries a price and day change on every row, so the results page can show
 * them without a request per row. Its `exchange` is a terse code (`NMS`,
 * `GER`) rather than the display name `search` returns, hence the map below.
 *
 * Both are undocumented, like the rest of the Yahoo surface.
 */
export class YahooSymbolSearch implements SymbolSearch {
  async search(query: string, limit: number): Promise<SymbolMatch[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const url =
      `${SEARCH_URL}?q=${encodeURIComponent(trimmed)}` +
      `&quotesCount=${limit}&newsCount=0&listsCount=0&enableFuzzyQuery=false`;
    const body = await request<SearchBody>(url, 'search', trimmed);

    const quotes = body?.quotes;
    if (!Array.isArray(quotes)) return [];
    return quotes
      .filter((quote: RawSearchQuote) => typeof quote?.symbol === 'string' && quote.symbol.length > 0)
      .map((quote: RawSearchQuote) => ({
        symbol: quote.symbol,
        // longname is fuller but absent on some instruments; shortname always is.
        name: quote.longname ?? quote.shortname ?? quote.symbol,
        exchange: quote.exchDisp ?? quote.exchange ?? '',
        type: quote.typeDisp ?? quote.quoteType ?? ''
      }));
  }

  async lookup(query: string, limit: number): Promise<SymbolMatch[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const url =
      `${LOOKUP_URL}?query=${encodeURIComponent(trimmed)}` +
      `&type=all&count=${limit}&start=0&formatted=false&lang=en-US&region=US`;
    const body = await request<LookupBody>(url, 'lookup', trimmed);

    const documents = body?.finance?.result?.[0]?.documents;
    if (!Array.isArray(documents)) return [];
    return documents
      .filter((doc: RawLookupDoc) => typeof doc?.symbol === 'string' && doc.symbol.length > 0)
      .map((doc: RawLookupDoc) => ({
        symbol: doc.symbol,
        name: doc.shortName ?? doc.symbol,
        exchange: displayExchange(doc.exchange),
        type: doc.quoteType ?? '',
        price: typeof doc.regularMarketPrice === 'number' ? doc.regularMarketPrice : null,
        changePercent:
          typeof doc.regularMarketPercentChange === 'number' ? doc.regularMarketPercentChange : null
      }));
  }
}

async function request<T>(url: string, step: string, query: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) {
    throw new Error(
      `[stock-ticker][YahooSymbolSearch][${step}] upstream rejected the request (status=${response.status} query=${query})`
    );
  }
  return (await response.json()) as T;
}

/**
 * The lookup endpoint reports Yahoo's internal exchange codes. Mapping the
 * common ones keeps a row readable; anything unmapped falls through as-is,
 * which is still better than blank.
 */
const EXCHANGE_NAMES: Record<string, string> = {
  NMS: 'NASDAQ',
  NGM: 'NASDAQ',
  NCM: 'NASDAQ',
  NYQ: 'NYSE',
  ASE: 'NYSE American',
  PCX: 'NYSE Arca',
  BTS: 'BATS',
  TOR: 'Toronto',
  VAN: 'TSXV',
  NEO: 'NEO',
  CNQ: 'CSE',
  LSE: 'London',
  GER: 'XETRA',
  FRA: 'Frankfurt',
  STU: 'Stuttgart',
  MUN: 'Munich',
  HAN: 'Hanover',
  DUS: 'Düsseldorf',
  BER: 'Berlin',
  HAM: 'Hamburg',
  MIL: 'Milan',
  PAR: 'Paris',
  AMS: 'Amsterdam',
  STO: 'Stockholm',
  SWX: 'Swiss',
  HKG: 'Hong Kong',
  TYO: 'Tokyo',
  JPX: 'Tokyo',
  ASX: 'Australia',
  SET: 'Thailand',
  NSI: 'NSE India',
  BSE: 'BSE India',
  SAO: 'São Paulo',
  SGO: 'Santiago',
  BUE: 'Buenos Aires',
  MEX: 'Mexico',
  DXE: 'Cboe Europe',
  VIE: 'Vienna',
  EBS: 'Swiss',
  OSL: 'Oslo',
  CPH: 'Copenhagen',
  HEL: 'Helsinki',
  LIS: 'Lisbon',
  MCE: 'Madrid',
  BRU: 'Brussels',
  IOB: 'London Intl',
  TLV: 'Tel Aviv',
  KSC: 'Korea',
  TAI: 'Taiwan',
  SES: 'Singapore',
  SHH: 'Shanghai',
  SHZ: 'Shenzhen',
  CCC: 'Crypto',
  CCY: 'Currency'
};

function displayExchange(code: string | undefined): string {
  if (!code) return '';
  return EXCHANGE_NAMES[code] ?? code;
}

interface SearchBody {
  quotes?: RawSearchQuote[];
}

interface LookupBody {
  finance?: { result?: Array<{ documents?: RawLookupDoc[] }> };
}

interface RawSearchQuote {
  symbol: string;
  longname?: string;
  shortname?: string;
  exchDisp?: string;
  exchange?: string;
  typeDisp?: string;
  quoteType?: string;
}

interface RawLookupDoc {
  symbol: string;
  shortName?: string;
  exchange?: string;
  quoteType?: string;
  regularMarketPrice?: number;
  regularMarketPercentChange?: number;
}
