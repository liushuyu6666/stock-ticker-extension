# Privacy Policy — Stock Ticker

_Last updated: 30 August 2026_

Stock Ticker is a browser extension that displays a strip of stock prices. This policy describes exactly what it does with data. It is short because the extension does very little.

## What is collected

**Nothing is collected by the developer.** There is no server, no account, no analytics, no telemetry, and no error reporting. No data of any kind is sent to the author of this extension.

## What is stored, and where

Everything is stored in your own browser, using Chrome's extension storage:

| What | Where | Why |
|---|---|---|
| Your watchlist — ticker symbols, your target prices, and each symbol's name and exchange | `chrome.storage.sync` | So your list follows your Chrome profile to your other machines |
| Up to one year of daily closing prices per symbol | `chrome.storage.local` | To draw the sparklines without refetching |
| A cached copy of the current prices being displayed | `chrome.storage.local` | So the strip renders instantly |

Data in `chrome.storage.sync` is synchronised by Chrome to devices signed into the same Google account, under Google's control, exactly as your bookmarks are. The developer has no access to it.

Uninstalling the extension removes all of it. Removing a ticker deletes its stored price history immediately.

## What is transmitted, and to whom

The extension makes requests to **Yahoo Finance** (`query1.finance.yahoo.com`) and to nowhere else. Those requests contain:

- the ticker symbols on your watchlist, in order to fetch their prices and price history; and
- the text you type into the add-ticker search box, in order to look up matching symbols.

They contain no identifier, no account, and nothing about you or your browsing. Yahoo's handling of those requests is governed by Yahoo's own privacy policy.

## What is *not* accessed

The extension injects a strip at the top of web pages, which requires permission to run on the pages you visit. It uses that access **only** to insert its own element into the page, inside an isolated shadow root.

It does not read page content, form fields, passwords, cookies, or browsing history; it does not modify any page beyond adding its own strip and shifting the page down to make room; and it does not track which sites you visit. None of that information is collected, stored, or transmitted anywhere.

## Data sale and transfer

No data is sold, rented, or transferred to anyone. There is nobody to transfer it to.

## Contact

Questions or concerns: open an issue at <https://github.com/liushuyu6666/stock-ticker-extension/issues>.
