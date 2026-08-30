import type { SymbolMatch } from '../shared/types';

/** Symbol lookup for the config page's add-ticker box. */
export interface SymbolSearch {
  search(query: string, limit: number): Promise<SymbolMatch[]>;
}
