import { STORAGE_KEYS, sendMessage } from '../shared/messages';
import type { TickerSnapshot } from '../shared/types';

/**
 * UI-side counterpart to MessageRouter. Pulls the first snapshot, then rides
 * storage.onChanged for updates rather than holding a port open against a
 * service worker that Chrome is free to suspend at any moment.
 */
export class TickerClient {
  /** Re-announces this bar so the worker keeps polling while it is on screen. */
  private static readonly HEARTBEAT_MS = 60_000;

  private listener: ((snapshot: TickerSnapshot) => void) | null = null;

  subscribe(listener: (snapshot: TickerSnapshot) => void): void {
    this.listener = listener;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const change = changes[STORAGE_KEYS.snapshot];
      if (!change?.newValue) return;
      this.listener?.(change.newValue as TickerSnapshot);
    });

    void this.pull();
    setInterval(() => void this.pull(), TickerClient.HEARTBEAT_MS);

    // A backgrounded tab should not keep the worker awake fetching prices.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.pull();
    });
  }

  async refreshNow(): Promise<void> {
    await sendMessage({ type: 'REFRESH_NOW' });
  }

  /** The worker opens the tab, since a content script cannot use chrome.tabs. */
  async openConfig(): Promise<void> {
    await sendMessage({ type: 'OPEN_CONFIG' });
  }

  private async pull(): Promise<void> {
    try {
      const response = await sendMessage({ type: 'GET_SNAPSHOT' });
      if ('snapshot' in response && response.ok) this.listener?.(response.snapshot);
    } catch {
      // The worker was asleep or the extension is reloading; the next tick retries.
    }
  }
}
