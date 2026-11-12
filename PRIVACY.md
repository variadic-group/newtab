# Privacy

**New Tab** is published by Variadic Group LLC. It has no server, no account and no
analytics: the publisher receives nothing from it. Everything below happens in your browser.

Last updated 2026-11-11.

## What it reads

| What | Why | Where it goes |
|---|---|---|
| Your bookmarks | To draw the page, and to change them when you drag, rename, add or remove | Nowhere. Changes are made to your own Chrome bookmarks |
| This window's open tabs (title, address, icon) | The Open tabs list, saving a tab, opening a collection as a tab group | Nowhere |
| Addresses you navigate to | To notice a typed short link (`mail/`, `claude/what to ask`) and send the tab where it points. Only one-word hosts and searches that begin with one of your short names are acted on | Nowhere. Nothing is kept |
| Where you are | Sun, moon, forecast and radar. The first new tab asks the computer for its location; if the computer can't say, you type a place. A place taken from the computer is checked again after six hours; a typed one stays put. Rounded to two decimal places (about a kilometre) | The rounded point goes to the National Weather Service to fetch the forecast |

## What it sends, and to whom

| To | What | When |
|---|---|---|
| National Weather Service (`api.weather.gov`, `radar.weather.gov`) | Your rounded location, then the radar station nearest it | When the forecast is more than 20 minutes old and you open a new tab |
| OpenStreetMap's Nominatim (`nominatim.openstreetmap.org`) | What you typed: a city, a ZIP code or an address | Only when you press Search in the location form |
| Google's icon service (`google.com/s2/favicons`, `gstatic.com`) | The host names of your bookmarks, one at a time | The first time a site's icon is needed; the answer is remembered |

Each of those services sees your IP address, as any website you visit does.

A short link typed with spaces (`claude/what should I ask`) is first treated by Chrome as a
search. The extension redirects that search before the page loads, but the request may reach
your search engine for a moment. Type it with hyphens (`claude/what-should-i-ask`), or use
`claude` then Tab, and nothing is searched.

## What it keeps

- **In Chrome's synced storage** (travels with your Chrome profile, through Google's sync): the
  short names you set, shortcuts you add, and your note.
- **In this browser only:** the place you set, the last forecast, which icons were found, the
  last space you opened, and tonight's dusk and dawn.

Removing the extension deletes all of it. Your bookmarks stay, including the `⏭️ Next` folder.

## Extras you can switch on

Both are off until you turn them on, and Chrome asks you for the permission at that moment.

- **Unread mail** reads the count from Gmail's inbox feed (`mail.google.com`) using your
  browser's own sign-in. Only the number is kept, on this computer.
- **Recent files** reads this browser's history for Google Docs, Sheets, Slides and Forms you
  opened in the last 30 days, to list them. Nothing is sent anywhere.

## Contact

hello@variadicgroup.com
