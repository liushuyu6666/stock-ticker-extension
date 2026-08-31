# Chrome Web Store submission notes

Copy for the developer dashboard, kept in the repo so the wording stays consistent between submissions. Nothing here ships in the extension.

## Listing

**Name** — `Stock Ticker` (Generic; something distinctive would fare better in search. Irrelevant while the listing is unlisted, worth reconsidering if it ever goes public.)

**Short description** (132 char limit, currently 84)

> A compact market-ticker bar: ticker, current/target price, and a one-year sparkline.

**Category** — Productivity (alternative: Workflow & Planning)

**Detailed description**

> Stock Ticker puts a narrow market strip at the top of every page: for each
> symbol you follow, its ticker, the current price against a target price you
> set yourself, and a one-year sparkline of daily closes.
>
> The sparkline is red when the price sits above your target and green when it
> is at or below it, so a glance tells you where every position stands relative
> to your own thinking — not an analyst's.
>
> • Add tickers by symbol or company name, across dozens of exchanges
> • Set and edit a target price per ticker
> • Click any ticker for a detail view: day and 52-week range, day change, and a
>   full one-year chart with a hover crosshair
> • The strip loops continuously and pauses when you hover it
> • Your watchlist follows your Chrome profile between machines
>
> Prices come from Yahoo Finance and are delayed roughly 15 minutes. This
> extension is not investment advice and makes no recommendations.

## Privacy tab

**Single purpose**

> Display a configurable strip of stock prices, each shown against a target
> price the user sets, with a one-year sparkline.

**Permission justifications**

| Permission | Justification |
|---|---|
| `storage` | Stores the user's watchlist and target prices, and caches daily closing prices locally so sparklines render without refetching. |
| `alarms` | Schedules the periodic price refresh and the daily history top-up. A Manifest V3 service worker is suspended when idle and cannot hold its own timers, so alarms are the only way to run recurring work. |
| Host permission: `https://query1.finance.yahoo.com/*` | The sole remote host contacted. Supplies current prices, daily price history, and symbol search results. Fetches must run in the service worker because the endpoint sends no CORS headers. |
| Content script on `http://*/*` and `https://*/*` | The ticker strip is rendered as page content because an extension cannot draw into browser chrome, and it has to appear on whatever page the user is viewing. The script only inserts its own element inside an isolated shadow root; it never reads page content, form data, or cookies. |

**Remote code** — None. All code is bundled in the package. The extension fetches JSON data only, never executable code.

**Data usage** — Does not collect or transmit user data. Ticker symbols and search terms are sent to Yahoo Finance solely to retrieve prices.

**Privacy policy URL** `https://github.com/liushuyu6666/stock-ticker-extension/blob/master/PRIVACY.md`

## Assets still needed

- [x] Screenshots — five, ready in `screenshots/`, each **1280×800** 24-bit PNG with no alpha channel, which is what the Store accepts. Upload them in filename order: the strip in place on a real page, the watchlist, the search dropdown, the all-matches page, the ticker detail dialog. They are the raw captures scaled to the full 1280 width and extended to the full height by continuing the page's own background, so each one fills the frame with no letterbox band. Nothing is cropped away except the browser scrollbar.
- [ ] Optional small promo tile, 440×280.

## Release checklist

1. Bump `version` in `public/manifest.json`.
2. `yarn check` — type check and build.
3. `yarn package` — writes `release/stock-ticker-extension-<version>.zip` with `manifest.json` at the archive root.
4. Upload the ZIP, set visibility to **Unlisted**, submit.
