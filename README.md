# New Tab

**Your bookmarks are already organised. This makes them your new tab.**

A new tab page for Chrome, drawn live from your bookmarks bar. Every folder on the bar is a tab;
every folder inside it is a card of icons. Type `mail/` or `claude/what should I ask` in the
address bar and go. Look up and see the sun where it really is.

Nothing to import. No account. Remove it and you have lost nothing.

![A space: collections of tiles, with the time, daylight, weather and radar across the top](store/screenshots/2-space.png)

## Why it exists

Launchers and tab managers usually want your links moved into them: a sign-up, an import that
is out of date by the next morning, a second place to keep tidy, and a paid plan once you depend
on it. Meanwhile your browser already has a link store that syncs to every computer you use, is
backed up with your profile, and is readable by every other tool you own. You have been using
it for years.

This page adds a face to that store and keeps nothing of its own:

- **Your links stay Chrome bookmarks.** Drag a tile here and the bookmarks bar changes. Bookmark
  a page anywhere and it appears here.
- **No lock-in, because there is nothing to export.** Uninstall it and every link is where it
  always was.
- **No account, no server, no analytics.** There is nobody on the other end.
- **Lean on purpose.** One page of plain JavaScript, no framework, no build step. It draws from
  what it has saved and never makes you wait for the network.
- **Free and open source.**

## What you get

**Launch**
- **Spaces and collections.** A bar folder is a space (Work, a client, a product). A folder in
  it is a collection: a card of icon tiles. A folder inside *that* is a headed group in the card.
- **Drag to reorder** tiles, cards and space tabs. It is your bookmarks moving, so the order
  holds everywhere.
- **Open all** opens a collection as one named tab group.
- **Edit** to rename, add and remove in place, with Undo.

**Type, don't click**
- `mail/` `cal/` `drive/` `keep/` `g/` `claude/` work from the address bar.
- **Every bookmark gets a short name** from its own name: `stripe/`, `github/`. Click one on the
  Shortcuts page to change it.
- **Add words to search:** `mail/invoice from the printer`, `drive/contract`,
  `claude/draft a reply to this`. Or type `claude`, press Tab, and ask.
- **Your own shortcuts:** any name to any address, with `%s` where the words go. `gpt/`, `yt/`,
  `gh/`, `maps/` and `wiki/` are one click to add.

**Pick up where you left off**
- **Up next:** pages to come back to, in order. One click on the toolbar button, or Alt+Shift+S.
  It is a bookmarks folder, so it syncs too.
- **Open tabs:** switch to one, reorder the tab strip, close one, or drag one into a collection.
  **Save all** files the whole window.
- **Notes:** a scratch box that follows your Chrome profile.

**Look up**
- **The sky, drawn to scale.** The sun's real path for today with solar noon in the middle, the
  civil, nautical and astronomical twilights under the horizon, and the moon where it stands, lit
  on the side that faces the sun.
- **The page goes dark when night falls** where you are, and light again at dawn.
- **Forecast and radar** from the National Weather Service: now, the next 24 hours, seven days,
  and the radar loop. A strip across the top of every space carries the short version.

| Day | Dusk | Night |
|---|---|---|
| ![Today by day](store/screenshots/4-today-day.png) | ![Today at dusk](store/screenshots/6-today-dusk.png) | ![Today at night](store/screenshots/7-today-night.png) |

Screenshots use sample bookmarks, a made-up forecast and a stand-in radar frame. With real
bookmarks the tiles show each site's own icon; a site without one gets its initial, as here.

## Install

**From a release (two minutes)**

1. Download `newtab-<version>.zip` from the [latest release](../../releases/latest) and unzip it
   somewhere it can stay, such as your Documents folder.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the unzipped folder.
4. Open a new tab. Chrome asks once whether to keep the new page: keep it.

To update, replace the folder's contents with the new release and click ↻ on the extension.

**From source:** clone this repository and load the `extension` folder the same way.

**For a team on Google Workspace:** once it is on the Chrome Web Store (public, unlisted or
private to your domain), force-install it by its ID in the Admin console under Chrome → Apps &
extensions. Pair it with managed bookmarks and every new hire opens a new tab onto the
company's tools. The listing text and assets are in [`store/`](store/listing.md).

New Tab is built and tested on Chrome 120 and later. Other Chromium browsers are untested.

## First five minutes

1. **Say where you are.** The strip at the top asks once: this computer's location, or a city.
   Until you answer, nothing is assumed and nothing is looked up.
2. **Shape the bar.** In Chrome's bookmark manager (the footer links to it), make one folder on
   the bookmarks bar per area of work, and folders inside for collections. Emoji in the names
   read well as tabs: `🏢 Work`, `✉️ Mail and calendar`, `💵 Money`.
3. **Learn three short links.** `mail/`, `cal/`, and the short name of the site you open most.
   The Shortcuts page lists them all.
4. **Pin the toolbar button** (puzzle icon → pin). Clicking it on any page saves that page to
   Up next.

## Permissions, and what leaves your browser

| Permission | What it is for |
|---|---|
| Bookmarks | The page *is* your bookmarks; edits here are edits to them |
| Tabs and tab groups | The Open tabs list; opening a collection as a group |
| Web navigation | Noticing a typed short link. Chrome words this, with Tabs, as "read your browsing history"; nothing is stored or sent |
| Storage | Your short names, shortcuts and note (synced by Chrome); your place and caches (this browser only) |
| Location | Only when you click "Use this computer's location" |
| `api.weather.gov` | The forecast |

Three services are called, each with the least it needs: the National Weather Service gets your
place rounded to about a kilometre; OpenStreetMap's Nominatim gets a city name when you press
Search; Google's icon service gets the host names of your bookmarks. The full account is in
[PRIVACY.md](PRIVACY.md).

**Extras** (footer → Extras) are off until you switch them on, and Chrome asks at that moment:
your Gmail unread count in the top strip, and a list of the Google Docs, Sheets and Slides you
opened lately.

## Good to know

- **The forecast and radar cover the United States**, because they come from the National
  Weather Service. Everywhere else the sun, moon and twilights still work.
- **A short link with spaces** (`claude/what should I ask`) reaches Chrome as a search, which the
  extension redirects. With hyphens, or with `claude` then Tab, nothing is searched at all.
- **Chrome's own site-search shortcuts** can't be read or changed by an extension; the footer
  links to that settings page.
- **Signed in to Chrome with sync on**, bookmarks live in the account's own bookmarks bar. The
  page reads every bar it finds.

## What is deliberately not here

A task manager, a search box (the address bar is already focused on a new tab), a list-or-grid
switch, a most-visited row, page previews, themes. Each was tried or considered and left out to
keep the page quiet.

## Next

- **Today's events and tasks in the top strip.** Reading Google Calendar and Tasks needs a
  Google sign-in for the extension, so it will be a third extra, off by default.
- **Notes and Up next in Chrome's side panel,** beside whatever page you are on.
- **Forecasts outside the United States.**

## Develop

No build step. The extension is the `extension` folder as it stands.

```
npm install
npx playwright install chromium
npm test            # 13 astronomy checks in Node, then 90 checks in a real Chromium
npm run shots       # the screenshots in store/screenshots
npm run zip         # newtab.zip, ready to upload or release
```

`extension/sky.js` is the astronomy: pure functions, no browser, tested against dates whose
answers are public record (a solstice sunrise in New York, the April 2024 eclipse). The browser
tests load the extension unpacked and exercise the real `chrome.*` APIs with every outside
request stubbed.

## Credits

Sun and moon positions are ported from [SunCalc](https://github.com/mourner/suncalc) by
Volodymyr Agafonkin (BSD 2-Clause); see [THIRD-PARTY.md](extension/THIRD-PARTY.md). Weather and
radar are from the U.S. National Weather Service. City search is © OpenStreetMap contributors.

## Licence

[MIT](LICENSE). New Tab is a product of Variadic Group LLC.
