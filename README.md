# Stock Ticker

A compact market-ticker strip for Chrome. Each card shows a symbol, the current
price against your own target, and a one-year sparkline — red when the price is
above your target, green when it is at or below it.

```
AAPL  319.70 / 180.00  ‿⁀‾    MSFT  513.53 / 420.00  ‿⁀‾    …
```

# Install

```bash
yarn install
yarn build          # writes dist/
```

Then `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
choose `dist/`.

`yarn watch` rebuilds on save; use the reload button on the extension card to
pick changes up. `yarn check` runs the type check and a clean build.

# Where the bar appears

A Chrome extension cannot draw into browser chrome, so the strip is page
content, injected into **every `http(s)` page** by a content script. It lives in
a shadow root, so the page's CSS cannot reach it and its CSS cannot leak out.

It cannot appear on `chrome://` pages, the Web Store, or the PDF viewer —
extensions are not permitted to run there.

**Not on the new tab page, deliberately.** Chrome offers no way to add anything
to `chrome://new-tab-page`: `chrome_url_overrides` *replaces* it wholesale, so
putting the bar there would cost you the wallpaper, the shortcut tiles and the
Continue-with-these-tabs card. That trade is not worth a ticker strip, so the
override was removed and the new tab is Chrome's own again.

**Known limitation:** the bar reserves its strip by shifting the document down.
Sites with their own `position: fixed` header still paint at viewport top and
will overlap it. There is no generic fix; those sites need a per-domain tweak.

# Configuration

**Click the bar** — anywhere on it — and the config page opens in a new tab.
The extension icon and the new tab's *Configure tickers* link go to the same
place.

The page is a sidebar plus a main panel. The sidebar holds one section today
(*Tickers*, with a live count); it is built from a list so the next section is
an array entry rather than a rewrite.

Each ticker is a card carrying its symbol, **full company name and exchange**
— so a card is identifiable without decoding the ticker from memory — the
current price, how far it sits from target in both absolute and percentage
terms, a year-long sparkline, and an editable target. The target commits on
blur or Enter rather than per keystroke, so typing `1` on the way to `180` does
not write storage or repaint the card mid-edit.

**Adding** goes through the search box at the top right: type a symbol or a
company name, pick from at most seven matches (each showing symbol, long name
and exchange), and confirm. The year of history is fetched immediately, so the
sparkline is populated by the time the card appears.

**Removing** asks for confirmation, then deletes the ticker *and its stored
history*, reclaiming the space rather than orphaning a series no one reads.

Targets are yours to set. Analyst consensus targets sit behind an authenticated
Yahoo endpoint that breaks often, and a target you chose yourself makes the
red/green a statement about your own thesis. Symbols, targets and labels live in
`chrome.storage.sync`, so the watchlist follows your Chrome profile.

# How it works

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
   SymbolSearch
   └ YahooSymbolSearch
  MessageRouter  ◄── chrome.runtime.onMessage
        ▲
        │  request / storage.onChanged
  ┌─────┴──────────────────┐   ┌───────────────────────────────┐
  │ content script │new tab │   │ config page                   │
  │   TickerClient          │   │   ConfigApp                   │
  │   TickerBar → StockCard │   │    ├ SidebarNav               │
  │            → sparkline  │   │    ├ SymbolSearchBox          │
  └─────────────────────────┘   │    ├ TickerGrid → TickerCard  │
                                │    └ ConfirmDialog            │
                                └───────────────────────────────┘
```

`TickerService` depends only on the three interfaces, never on Yahoo or on a
storage backend directly — which is what makes either one swappable. The UI
classes never import a provider: `TickerBar`/`TickerCard` are pure renderers
over `TickerRow`, and `TickerClient`/`ConfigApp` are the only things that know
the worker exists.

## Data source

Yahoo Finance's `spark` endpoint, which returns the live price *and* the daily
close series in one batched call:

```
https://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL,MSFT&range=1y&interval=1d
```

No API key and no quota headers, but it is **undocumented** — Yahoo's official
v7 `quote` endpoint already returns `Unauthorized` without a crumb, and `spark`
could follow. That risk is the reason `QuoteProvider` is an interface: a
Finnhub or Twelve Data implementation only has to satisfy two methods.

Symbol lookup for the add box uses the sibling search endpoint, which honours
`quotesCount` exactly — so the seven-result cap is enforced upstream rather than
by slicing a longer list:

```
https://query1.finance.yahoo.com/v1/finance/search?q=msft&quotesCount=7&newsCount=0
```

The spark payload's `meta` already carries `longName` and `fullExchangeName`, so
stored labels refresh for free on every quote poll. `refreshLabels` only writes
when something actually changed — otherwise the minute-by-minute poll would burn
the `chrome.storage.sync` write quota.

Prices are delayed roughly 15 minutes on most exchanges.

The fetch **must** happen in the service worker. Yahoo sends no CORS headers,
and only the worker's `host_permissions` grant bypasses that; the same call
from a content script would fail.

## Network calls

Four triggers, and nothing else reaches the network.

| Trigger | Request | Notes |
|---|---|---|
| **Typing in the search box** | `v1/finance/search` | Debounced 220 ms — one call per typing *pause*, not per keystroke. Seven results, capped upstream by `quotesCount` |
| **Every minute** | `spark?range=1d` | Price only. Fires **only while a bar is on screen**: if nothing has asked for a snapshot in 5 minutes, the alarm runs and does nothing |
| **Every hour** | `spark?range=5d…1y` | A *gap check*, not a fetch. It reads each symbol's newest stored bar locally and calls out only when one is older than the last trading day — so in practice **about one fetch per trading day**, and 23 of every 24 ticks touch no network at all. The range is the smallest window covering the gap: `5d` for a routine daily top-up, widening to `1mo`/`3mo`/`1y` after a long absence |
| **Adding a ticker** | `spark?range=1y` | Immediate backfill, so the sparkline is populated by the time the card appears |

Browser startup and the manual refresh also run a gap check followed by a quote
poll, on the same two code paths.

**The two kinds of data age differently** — a live price is stale within a
minute, a closed day's close is never stale at all — so they run on separate
clocks. The hourly one is deliberately a gap check rather than a wall-clock
schedule: a fixed time assumes the browser happens to be running at that moment,
whereas asking "is my newest bar older than the last trading day?" self-heals
after a weekend or a sleeping laptop.

**History is fetched once and then reused.** The year downloaded when a ticker
is added is what the carousel draws for the life of that ticker; the per-minute
poll fetches only the price and joins it against the stored series with a local
read. It is written with an **upsert keyed by date**, never an append, so a
missed day, a double-fired alarm, and a manual refresh all converge to the same
series instead of duplicating it.

**Requests are sized to the gap, and skipped when there is none.** A symbol one
trading day behind is topped up with `range=5d` — 8 KB across a seven-symbol
watchlist, against 38.9 KB for `range=1y`. Stale symbols are grouped by the
window they need, so the steady-state daily sync is a single `5d` request no
matter how many tickers are on the list, and only a genuinely long absence
widens it. Under-fetching would leave a silent hole in the series, so each
threshold sits well inside its window; over-fetching only costs bytes.

**Not every change needs a quote.** Editing a target price or removing a ticker
goes through `TickerService.rebuild()`, which re-joins the watchlist and stored
history onto the prices already in the snapshot without touching the network. A
target is the user's own number: it changes which side of the line a row falls
on, not what the market says.

### Planned: configurable refresh

Both intervals above are hard-coded constants today —
`RefreshScheduler.QUOTE_PERIOD_MINUTES` and `HISTORY_PERIOD_MINUTES`. A later
section on the options page will expose them, turning the cadences into
settings rather than constants:

| Setting | Today | Planned |
|---|---|---|
| Quote poll interval | 1 min, hard-coded | user-chosen, 1 min and up (Chrome clamps anything lower) |
| History gap check | every 60 min, hard-coded | user-chosen interval |
| Consumer idle timeout | 5 min, hard-coded | user-chosen, or off |

There is deliberately **no wall-clock schedule** among these — no "fetch at
16:15 ET". A fixed time assumes the browser happens to be running at that
moment, and silently skips the day when it isn't. The gap check asks a question
that survives a weekend, a closed laptop, or a browser quit at 16:15, so it is
the mechanism rather than a fallback behind one.

Settings belong in `chrome.storage.sync` beside the watchlist, and
`RefreshScheduler.install()` needs to re-create its alarms whenever they change,
since `chrome.alarms.create` on an existing name replaces the schedule.

## Storage

`chrome.storage.local`, and four measures keep it honest. Measured on a 7-symbol
watchlist against real Yahoo data:

| | before | after |
|---|---|---|
| `history:*` keys | 103 KB | **67 KB** (−35%) |
| `cache:snapshot` | 13.0 KB | **4.3 KB** (−67%) |
| total | 116 KB | **71 KB** |

1. **The snapshot stores a render payload, not a second copy of history.** It
   used to carry every symbol's full close series — a duplicate of the history
   store, rewritten on every quote poll. It now carries the series downsampled
   to 70 points, which is the most any surface can draw. The card's sparkline is
   bit-identical as a result; the bar's shifts imperceptibly, since it samples
   28 points from 70 rather than from 251.
2. **History is capped at one trading year** (`MAX_HISTORY_BARS = 260`), not the
   arbitrary 400 it used to be. 400 bars is ~1.6 years — storage a one-year
   sparkline could never show, and which would have quietly stretched the
   chart's span past a year once it filled.
3. **An unchanged snapshot is not rewritten.** Markets are shut for roughly
   three quarters of the week, and through all of it the poll would otherwise
   store a byte-identical payload every minute and wake every open surface to
   re-render it.
4. **Pruning runs on every history sync**, not only when a backfill happened, so
   a series orphaned by a removal that raced the worker's suspension is
   reclaimed on the next pass rather than lingering indefinitely.

One thing deliberately *not* done: rounding stored closes. The `spark` endpoint
already returns short decimals (`232.14`), unlike the `chart` endpoint
(`232.13999938964844`), so a rounding pass would cost precision and save
nothing.

A MongoDB-backed `HistoryStore` was considered and deliberately deferred: it
would need a local HTTP service (MV3 has no TCP sockets), which turns a
self-contained extension into one that shows empty sparklines whenever a daemon
is not running. It earns its place only for intraday resolution, history beyond
Yahoo's window, or other consumers — and the interface is already in place for
that day.

# Design notes

- **Sparkline density** is an explicit budget per size, not a function of width:
  the legible density is sub-linear. The 46px bar uses 28 points and the 260px
  card uses 70, each picked by rendering a year of real closes across five
  budgets and taking the last one that still reads as a trend line rather than a
  scratchy trace.
- **Search is debounced at 220ms and guarded by a monotonic query token**, so a
  slow reply for `ms` cannot overwrite the results already shown for `msft`.
- **Cards have no separators**, per spec. Adding a hairline is one rule in
  `src/ui/styles.ts`.
- **The marquee only runs when the content overflows**, duplicating the card
  group so the wrap-around is seamless. It pauses on hover, and
  `prefers-reduced-motion` swaps it for ordinary horizontal scrolling.
