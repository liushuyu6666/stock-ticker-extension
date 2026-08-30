import { sendMessage } from '../shared/messages';
import type { WatchlistEntry } from '../shared/types';

/**
 * Watchlist editor. Targets are user-owned here rather than scraped from an
 * analyst feed, which is what makes the red/green a statement about the user's
 * own thesis instead of the street's.
 */
class OptionsApp {
  private entries: WatchlistEntry[] = [];

  private readonly tbody = document.getElementById('rows') as HTMLTableSectionElement;
  private readonly status = document.getElementById('status') as HTMLElement;
  private readonly symbolInput = document.getElementById('new-symbol') as HTMLInputElement;
  private readonly targetInput = document.getElementById('new-target') as HTMLInputElement;

  async start(): Promise<void> {
    document.getElementById('add-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.addEntry();
    });
    document.getElementById('save')?.addEventListener('click', () => void this.save());

    const response = await sendMessage({ type: 'GET_WATCHLIST' });
    if ('entries' in response && response.ok) this.entries = response.entries;
    this.render();
  }

  private addEntry(): void {
    const symbol = this.symbolInput.value.trim().toUpperCase();
    const target = Number(this.targetInput.value);
    if (symbol.length === 0) return;
    if (this.entries.some((entry) => entry.symbol === symbol)) {
      this.setStatus(`${symbol} is already on the watchlist`, true);
      return;
    }
    this.entries.push({
      symbol,
      targetPrice: Number.isFinite(target) ? target : 0,
      order: this.entries.length
    });
    this.symbolInput.value = '';
    this.targetInput.value = '';
    this.render();
    this.setStatus('Added — remember to save', false);
  }

  private render(): void {
    this.tbody.replaceChildren();
    for (const [index, entry] of this.entries.entries()) {
      const row = document.createElement('tr');

      const symbolCell = document.createElement('td');
      symbolCell.textContent = entry.symbol;
      symbolCell.className = 'symbol';

      const targetCell = document.createElement('td');
      const targetField = document.createElement('input');
      targetField.type = 'number';
      targetField.step = '0.01';
      targetField.min = '0';
      targetField.value = String(entry.targetPrice);
      targetField.addEventListener('input', () => {
        const parsed = Number(targetField.value);
        this.entries[index].targetPrice = Number.isFinite(parsed) ? parsed : 0;
      });
      targetCell.append(targetField);

      const actionCell = document.createElement('td');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        this.entries.splice(index, 1);
        this.render();
        this.setStatus('Removed — remember to save', false);
      });
      actionCell.append(remove);

      row.append(symbolCell, targetCell, actionCell);
      this.tbody.append(row);
    }
  }

  private async save(): Promise<void> {
    this.setStatus('Saving…', false);
    const response = await sendMessage({
      type: 'SAVE_WATCHLIST',
      entries: this.entries.map((entry, order) => ({ ...entry, order }))
    });
    if (response.ok) {
      this.setStatus('Saved. The bar refreshes within a minute.', false);
    } else {
      this.setStatus(response.error, true);
    }
  }

  private setStatus(message: string, isError: boolean): void {
    this.status.textContent = message;
    this.status.className = isError ? 'status is-error' : 'status';
  }
}

void new OptionsApp().start();
