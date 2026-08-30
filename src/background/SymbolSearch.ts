import type { SymbolMatch } from '../shared/types';

/** Symbol lookup for the config page's add-ticker box. */
export interface SymbolSearch {
  /** The short, ranked list behind the dropdown. */
  search(query: string, limit: number): Promise<SymbolMatch[]>;
  /** The long list behind "view all", which the dropdown cannot show. */
  lookup(query: string, limit: number): Promise<SymbolMatch[]>;
}
