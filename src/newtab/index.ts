import { TICKER_CSS } from '../ui/styles';
import { TickerBar } from '../ui/TickerBar';
import { TickerClient } from '../ui/TickerClient';

const SEARCH_ACTION = 'https://www.google.com/search';

function mount(): void {
  const slot = document.getElementById('ticker-slot');
  if (!slot) return;

  const shadow = slot.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = TICKER_CSS;

  const bar = new TickerBar();
  shadow.append(style, bar.element);

  const client = new TickerClient();
  client.subscribe((snapshot) => bar.update(snapshot.rows));

  const form = document.getElementById('search') as HTMLFormElement | null;
  form?.setAttribute('action', SEARCH_ACTION);
  (document.getElementById('q') as HTMLInputElement | null)?.focus();

  document.getElementById('open-options')?.addEventListener('click', (event) => {
    event.preventDefault();
    void chrome.runtime.openOptionsPage();
  });
}

mount();
