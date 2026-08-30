# Stock Ticker

A compact market-ticker strip for Chrome. Each card shows a symbol, the current
price against your own target, and a one-year sparkline — red when the price is
above your target, green when it is at or below it.

```
AAPL  319.70 / 180.00  ‿⁀‾    MSFT  513.53 / 420.00  ‿⁀‾    …
```

## Install

```bash
yarn install
yarn build          # writes dist/
```

Then `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
choose `dist/`.

`yarn watch` rebuilds on save; use the reload button on the extension card to
pick changes up. `yarn check` runs the type check and a clean build.

## Where the bar appears

A Chrome extension cannot draw into browser chrome, so the strip is page
content, mounted on two surfaces:

- **Every `http(s)` page**, via a content script. It lives in a shadow root, so
  the page's CSS cannot reach it and its CSS cannot leak out.
- **The new tab page**, via `chrome_url_overrides`.

It cannot appear on `chrome://` pages, the Web Store, or the PDF viewer —
extensions are not permitted to run there.

**Known limitation:** the bar reserves its strip by shifting the document down.
Sites with their own `position: fixed` header still paint at viewport top and
will overlap it. There is no generic fix; those sites need a per-domain tweak.

## Configuration

Right-click the extension icon → **Options** (or *Edit watchlist* on the new
tab). Symbols and targets are stored in `chrome.storage.sync`, so they follow
your Chrome profile.

Targets are yours to set. Analyst consensus targets sit behind an authenticated
Yahoo endpoint that breaks often, and a target you chose yourself makes the
red/green a statement about your own thesis.

## How it works

Everything that touches the network or storage runs in the service worker. The
UI surfaces are renderers that receive rows and paint them.

```
background (service worker)
  RefreshScheduler ──drives──► TickerService
                                 │
        ┌────────────────────────┼──────────────────┐
        ▼                        ▼                  ▼
   QuoteProvider            HistoryStore     WatchlistRepository
   └ YahooQuoteProvider     └ LocalHistoryStore
  MessageRouter  ◄── chrome.runtime.onMessage
        ▲
        │  request / storage.onChanged
  ┌─────┴─────────────────┐   ┌──────────────┐
  │ content script │ new tab │ │ options page │
  │   TickerClient          │ │   OptionsApp │
  │   TickerBar → StockCard → sparkline      │
  └─────────────────────────┘ └──────────────┘
```

`TickerService` depends only on the three interfaces, never on Yahoo or on a
storage backend directly — which is what makes either one swappable.

### Data source

Yahoo Finance's `spark` endpoint, which returns the live price *and* the daily
close series in one batched call:

```
https://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL,MSFT&range=1y&interval=1d
```

No API key and no quota headers, but it is **undocumented** — Yahoo's official
v7 `quote` endpoint already returns `Unauthorized` without a crumb, and `spark`
could follow. That risk is the reason `QuoteProvider` is an interface: a
Finnhub or Twelve Data implementation only has to satisfy two methods.

Prices are delayed roughly 15 minutes on most exchanges.

The fetch **must** happen in the service worker. Yahoo sends no CORS headers,
and only the worker's `host_permissions` grant bypasses that; the same call
from a content script would fail.

### Refresh cadences

The two kinds of data age differently — a live price is stale within a minute,
a closed day's close is never stale at all — so they run on separate clocks.

| Data | Cadence | Why |
|---|---|---|
| Live price | every minute, **only while a bar is on screen** | the sole volatile field; an idle browser stops polling after 5 min |
| Daily bars | hourly *gap check*, not a fixed daily cron | the browser is often closed at any given wall-clock time; asking "is my newest bar older than the last trading day?" self-heals after a weekend or a sleeping laptop |
| Backfill | on demand, when a symbol is added | one `range=1y` fetch, then those bars are never refetched |

History is written with an **upsert keyed by date**, never an append. A missed
day, a double-fired alarm, and a manual refresh therefore all converge to the
same series instead of duplicating it.

### Storage

`chrome.storage.local`. A year of daily closes is ~250 floats, so a realistic
watchlist costs well under 100 KB of the 10 MB budget.

A MongoDB-backed `HistoryStore` was considered and deliberately deferred: it
would need a local HTTP service (MV3 has no TCP sockets), which turns a
self-contained extension into one that shows empty sparklines whenever a daemon
is not running. It earns its place only for intraday resolution, history beyond
Yahoo's window, or other consumers — and the interface is already in place for
that day.

## Design notes

- **Sparkline density** is capped at 28 points. Rendered against a year of real
  closes at 14/20/28/40/64, anything above ~28 reads as noise at 46px wide and
  anything below starts collapsing the year's actual shape.
- **Cards have no separators**, per spec. Adding a hairline is one rule in
  `src/ui/styles.ts`.
- **The marquee only runs when the content overflows**, duplicating the card
  group so the wrap-around is seamless. It pauses on hover, and
  `prefers-reduced-motion` swaps it for ordinary horizontal scrolling.
