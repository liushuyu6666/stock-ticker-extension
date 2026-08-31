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

`yarn package` writes `release/stock-ticker-extension-<version>.zip` with
`manifest.json` at the archive root, ready for the Chrome Web Store. See
[STORE_LISTING.md](STORE_LISTING.md) for the listing copy and permission
justifications, and [PRIVACY.md](PRIVACY.md) for the privacy policy.

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
The toolbar icon opens the same page.

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
company name and pick from at most seven matches, each showing symbol, long name
and exchange. The year of history is fetched immediately, so the sparkline is
populated by the time the card appears.

Seven is Yahoo's hard cap on that endpoint, so the dropdown ends with a
**View all matches** link to the full list — fifty-odd rows with a price, day
change, instrument type and an *Added* marker on anything already tracked.

A query that wide spans a lot of venues: "microsoft" alone returns **19
different exchanges** — the US listing plus CDRs, depositary receipts and
leveraged ETFs from a dozen countries. So the results page carries an
**exchange filter**, sorted busiest-venue-first (alphabetical would bury the
listing you almost certainly want under two dozen options). It filters the rows
already fetched rather than issuing another request, and the count reads
"18 of 50 matches" so it is obvious something is being hidden.
Pressing **Enter** goes there too, which matters because the dropdown can close
underneath you mid-type: a slow reply, a stray click, a query with no quick
match. Enter always lands somewhere useful. Arrow-select a row first and Enter
opens that symbol instead.

**Clicking anything — a dropdown row, a results row, or a card already on the
bar — opens a detail dialog**: current price with the day's change, a large
one-year sparkline, the day's and 52-week ranges, and the target field. For a
symbol you do not yet track it offers *Add ticker*; for one you do, *Save
target* and *Remove*. The sparkline retints live as you type a target across the
current price, so you can see which side of your line the year sits on before
committing.

**Hovering that sparkline** draws a crosshair — a vertical rule, a dot on the
line and a label giving that day's date and close. It reads from the series the
dialog already holds, so tracking the cursor issues no request of any kind.

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
   SymbolSearch  (search = dropdown, lookup = full results)
   └ YahooSymbolSearch
  MessageRouter  ◄── chrome.runtime.onMessage
        ▲
        │  request / storage.onChanged
  ┌─────┴──────────────────┐   ┌───────────────────────────────┐
  │ content script          │   │ config page                   │
  │   TickerClient          │   │   ConfigApp                   │
  │   TickerBar → StockCard │   │    ├ SidebarNav               │
  │            → sparkline  │   │    ├ SymbolSearchBox          │
  └─────────────────────────┘   │    ├ TickerGrid → TickerCard  │
                                │    ├ SearchResultsView        │
                                │    ├ TickerDetailDialog       │
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

## The three threads

The three sections below follow a single chain: a **request** brings data in,
some of it is **stored**, and what is **drawn** is downsampled from what is
stored. Nothing is drawn at a resolution it was not stored at, and nothing is
stored that no longer has an owner.

```
                     ── stored ──────────────────   ── derived ────────────────
Yahoo ──request──▶   history:<SYMBOL>   ──────────▶ cache:snapshot ──▶ bar / card
                     260 dated closes               70 closes/row       28 points
                     permanent per ticker           disposable          never stored

Yahoo ──request──▶   (nothing stored)  ─────────────────────────────▶ detail dialog
                                                                       every session
```

## 1 · Network calls — what triggers a request, and what it leaves behind

Four triggers, and nothing else reaches the network.

| Trigger | Request | Stored afterwards? | Notes |
|---|---|---|---|
| **Typing in the search box** | `v1/finance/search` | **No** — lives in the dropdown's DOM, gone when it closes | Debounced 220 ms — one call per typing *pause*, not per keystroke. Seven results, capped upstream by `quotesCount` |
| **Every minute** | `spark?range=1d` | **Yes, overwritten.** Prices land in `cache:snapshot` (local), rewritten only when a row actually changed. Names and exchanges are written back to `watchlist` (sync) only when one of them changed | Price only. Fires **only while a bar is on screen**: if nothing has asked for a snapshot in 5 minutes, the alarm runs and does nothing |
| **Every hour** | `spark?range=5d…1y` | **Yes, merged.** Bars upserted by date into `history:<SYMBOL>` (local), capped at 260 | A *gap check*, not a fetch. It reads each symbol's newest stored bar locally and calls out only when one is older than the last trading day — so in practice **about one fetch per trading day**, and 23 of every 24 ticks touch no network at all. The range is the smallest window covering the gap: `5d` for a routine daily top-up, widening to `1mo`/`3mo`/`1y` after a long absence |
| **Adding a ticker** | `spark?range=1y` | **Yes, merged** — same `history:<SYMBOL>` path, plus the watchlist entry in sync | Immediate backfill, so the sparkline is populated by the time the card appears |
| **"View all" / Enter** | `v1/finance/lookup` | **No** — held in memory by the results view so the exchange filter can work without refetching, discarded on navigating away | The long results list. A *different* endpoint from the dropdown's, because that one returns seven rows and ignores a larger `quotesCount` — verified against the live API. `lookup` honours `count` into the dozens and carries a price and day change per row, so the results page needs no request per row |
| **Opening a ticker's details** | `spark?range=1y` | **No** — rendered and discarded, including its full-resolution year | One call yields both the dialog's numbers (day and 52-week range, day change) and its full-resolution year, for any symbol — including one not on the watchlist. The hover crosshair then costs nothing: it reads the series already in hand |

Two things that column makes plain:

- **Only the two scheduled calls persist anything.** Everything driven by a click
  or a keystroke — search, lookup, preview — is read-only against storage, which
  is why browsing around the config page cannot grow the extension's footprint.
- **The detail dialog throws away a full year it just downloaded.** It could
  upsert those bars into `history:<SYMBOL>`, but only for a symbol already on the
  watchlist, and the hourly sync maintains that series anyway. Writing there
  would mean a click-driven path competing with the scheduled one for the same
  keys, which is not worth the saving.

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

## 2 · Storage — what is permanent, what is disposable

Five keys, in two areas. The distinction that matters is **lifetime**: only two
of them are authored by you or paid for with a network request, and the rest can
be deleted at any moment without losing anything.

Throughout this section, **a series** (one symbol's ordered run of daily closes,
oldest first — the entire value stored under its `history:` key) is the unit
being kept, merged or reclaimed.

| Key | Area | Holds | Lifetime |
|---|---|---|---|
| `watchlist` | sync | symbols, targets, names, exchanges | **Permanent.** The only thing you author. Follows your Chrome profile |
| `history:<SYMBOL>` | local | up to 260 dated closes, encoded | **Permanent for as long as the ticker is on the list.** Never expires, never trimmed by age — only removing the ticker deletes it, and removal deletes it immediately |
| `history:index` | local | a flat list of symbol names — which symbols have a series stored | **Derived, but not self-healing** — see below. Shrinks as tickers are removed |
| `cache:snapshot` | local | one render payload, 70 closes per row | **Disposable.** Delete it and the next poll rebuilds it from history plus one quote fetch |
| `meta:lastConsumerSeenAt` | local | when a bar was last on screen | **Disposable.** Worst case, one skipped poll |

**`history:index` stores symbols, not series.** It is a flat list of ticker
names — `["AAPL", "MSFT", "NVDA"]` — and nothing more: no dates, no closes, no
part of the series themselves. Its whole job is to answer one question, *which
symbols currently have a series stored on this device?*

**The second machine is why it exists.** Remove a ticker and its series is
deleted on that machine, but not simultaneously on your others — only the
watchlist syncs. Each of those compares the shorter watchlist against its own
`history:index`, and `prune` deletes the series of any symbol left over.

Losing the list is unrecoverable: `prune` then finds nothing stale, and every
existing orphan is invisible for good. Now that a year of closes encodes to
2.7 KB, enumerating the real `history:` keys instead would cost ~23 KB an hour
and be drift-free by construction.

**`sync` versus `local`.** Two areas with different jobs, and the split is the
single most load-bearing decision in this section:

| | `chrome.storage.sync` | `chrome.storage.local` |
|---|---|---|
| Travels between your machines | **Yes**, via your Chrome profile | **No**, one device only |
| Size | 100 KB total, 8 KB per item | 10 MB |
| Write rate | capped (~1,800/hour, 120/min) | uncapped |
| Holds here | the watchlist — what you authored | history and caches — what was fetched |

The rule of thumb: **`sync` is for intent, `local` is for data.** Which tickers
you follow and what you consider a fair price are decisions worth carrying to
another machine; a year of Microsoft closes is not, since any machine can refetch
it in one request. That split is also why label writes are skipped unless
something changed — a per-minute poll writing unconditionally would sit at
`sync`'s rate ceiling all day.

**What the sparklines are drawn from:** the bar and the config card both read
`cache:snapshot` — never the history keys directly, and never the network. The
detail dialog is the exception: it fetches its own full-resolution year and
stores none of it, which is why it can chart a symbol you have never tracked.

So a ticker's cost is bounded and self-clearing: adding one creates exactly one
history key, and removing it deletes that key in the same operation. Nothing
accumulates for a ticker you no longer hold.

#### Why orphans still happen

A series with no ticker to belong to is an **orphan**. On the device where you
press Remove, there is never one: `REMOVE_SYMBOL` deletes the watchlist entry
and the series together. Orphans arise on the *other* device, and on any device
where that pair of deletes did not complete.

**Absence is the signal — no tombstone list is needed.** `prune` is handed the
current watchlist and deletes every stored series not in it. Because the
watchlist is *complete* and syncs across machines, a symbol missing from it can
only mean it was removed. There is nothing a "deleted symbols" list could say
that its absence from the watchlist does not already say, so the extension keeps
no such list — one less thing to keep consistent across two devices with no
transactions between them.

Three situations reach `prune`, and it handles all of them the same way:

1. **A removal on another machine.** The shorter watchlist syncs down; the local
   `history:` key does not know about it until the next sweep.
2. **The two deletes are not atomic.** `REMOVE_SYMBOL` drops the watchlist entry
   and then the series, as two awaits. Chrome suspends MV3 workers aggressively,
   so a suspension between them leaves the series behind.
3. **Older installs.** Before the config page existed there was no way to remove
   a ticker and no `history.remove()` to call, so anything stored by those
   versions has never been cleaned up.

`prune` runs on **every** history sync — hourly, before the staleness check, and
before the early return for an empty watchlist. That last point matters more
than it looks: emptying the watchlist entirely is the moment when *every* stored
series becomes an orphan at once, and returning early there used to strand all
of them permanently.

### Size

Five measures keep it small. Measured on a 7-symbol watchlist against real
Yahoo data:

| | originally | now |
|---|---|---|
| `history:*` keys | 103 KB | **18.4 KB** (−82%) |
| `cache:snapshot` | 13.0 KB | **4.3 KB** (−67%) |
| total | 116 KB | **22.7 KB** (−80%) |

The quota is **per extension**, not shared with other extensions or with any
website: `chrome.storage.local` allows 10 MB, so the figure above is 0.2% of it.
`chrome.storage.sync` — which holds only the watchlist — is far tighter at 100 KB
with a documented write-rate limit, which is why label writes are skipped unless
something actually changed.

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
5. **Series are stored as a start date plus whole-day offsets**, not as one
   `{date, close}` object per bar. Repeating a key name and a full ISO string on
   every one of ~250 bars cost about three quarters of the payload: a year of
   closes drops from 9.3 KB to 2.7 KB. Offsets are *not* assumed contiguous —
   weekends and holidays simply produce a jump — and the decoded shape callers
   see is unchanged, so the encoding stays private to `LocalHistoryStore`.
   `lastBarDate` reads the last offset straight off the encoded form rather than
   rebuilding a few hundred objects to look at one, which matters because the
   hourly gap check asks it for every symbol. A `v` marker tags the format, and
   the legacy array still decodes, so an existing install migrates silently on
   each symbol's next upsert.

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

## 3 · Sparkline density — where each chart's points come from

A year is ~251 daily closes, but almost nowhere should draw all of them. Each
size declares its own **point budget** — the series is evenly downsampled to
that many points before the path is built.

| Where | Size | Budget | Constant | Downsampled from |
|---|---|---|---|---|
| Ticker bar card | 46 × 14 | **28** | `MAX_POINTS` (default) | the snapshot's 70, at draw time |
| Config page card | 260 × 48 | **70** | `SNAPSHOT_SERIES_POINTS` | history's 260, in `TickerService` |
| Detail dialog | 435 × 108 | **400 — i.e. every session** | `DETAIL_SERIES_POINTS` | its own live fetch — nothing stored |

Read down that last column and the chain from the top of this section reappears:
**260 stored → 70 published → 28 drawn.** Each step is a downsample of the one
above it, and each is lossy and one-way, which is why the durable copy has to be
the unsampled one — you cannot append tomorrow's close to an already-sampled
series and re-derive an honest 70.

**The budget is declared, never derived from width.** The first version scaled
it linearly, which handed the 260px card ~158 points and made it visibly
scratchy — the same noise the 46px bar had already been tuned away from. Legible
density is *sub-linear* in width, and it depends on height too: a taller box
gives the line room to separate, so the detail dialog tolerates far more points
per pixel than the bar does.

Each number was chosen the same way — render a year of real closes across five
budgets at that exact size, then take the densest one that still reads as a
trend line rather than a scratchy trace:

- At **46px** the choice is stark. 64 and 40 points are noise; 14 collapses the
  year's actual shape. 28 is the only comfortable answer.
- At **260px** it is subtler. 158 is scratchy and 34 over-smooths, with 70 the
  balance.
- At **435 × 108** it barely matters — even the full 251 points read cleanly,
  because the height carries them. So the dialog does not downsample at all: its
  budget of 400 sits above a trading year's ~252 sessions, and the cap exists
  only to guard against a pathologically long series.

Drawing every session there is not just cosmetic. It is what lets the **hover
crosshair** land on a real trading day: a point index *is* a session index, so
the date under the cursor needs no separate lookup and no interpolation between
sampled points. At 436px that works out to ~1.7px per session.

`SNAPSHOT_SERIES_POINTS` does double duty: it is also the cap on what the
published snapshot stores, so the largest thing routinely drawn and the most
that is kept are one constant rather than two that can drift. The detail dialog
exceeds it only because it fetches its own full-resolution year on demand.

# Design notes

- **Search is debounced at 220ms and guarded by a monotonic query token**, so a
  slow reply for `ms` cannot overwrite the results already shown for `msft`.
- **Cards have no separators**, per spec. Adding a hairline is one rule in
  `src/ui/styles.ts`.
- **The marquee clones the row set** until it covers the viewport plus one copy,
  then travels exactly one copy's width — which loops seamlessly whether the
  cards overflow the screen or fall well short of it. It pauses on hover, and
  `prefers-reduced-motion` swaps it for ordinary horizontal scrolling.
