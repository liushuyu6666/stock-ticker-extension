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
  private heartbeat: number | null = null;

  subscribe(listener: (snapshot: TickerSnapshot) => void): void {
    this.listener = listener;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const change = changes[STORAGE_KEYS.snapshot];
      if (!change?.newValue) return;
      this.listener?.(change.newValue as TickerSnapshot);
    });

    void this.pull();
    this.heartbeat = setInterval(() => void this.pull(), TickerClient.HEARTBEAT_MS) as unknown as number;

    // A backgrounded tab should not keep the worker awake fetching prices.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.pull();
    });
  }

  stop(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.listener = null;
  }

  async refreshNow(): Promise<void> {
    await sendMessage({ type: 'REFRESH_NOW' });
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
