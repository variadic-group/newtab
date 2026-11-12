# Chrome Web Store listing kit

Everything to paste into the Developer Dashboard. Sources checked 2026-11-11:
[publish](https://developer.chrome.com/docs/webstore/publish),
[images](https://developer.chrome.com/docs/webstore/images),
[register](https://developer.chrome.com/docs/webstore/register),
[privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).

## Steps (a person does these)

1. Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) signed in as the
   account that should own the listing. Registering means accepting the developer agreement and
   paying the one-time registration fee; the account's email can't be changed later.
2. **Add new item** → upload `newtab-<version>.zip` from the repository's latest release
   (`npm run zip` makes the same file from `extension/`).
3. **Store listing:** paste the text below; upload the five screenshots from
   `store/screenshots/` and `store/promo-440x280.png`.
4. **Privacy:** paste the single purpose, the permission reasons and the data answers below.
   Privacy policy URL: the address of `PRIVACY.md` in this repository.
5. **Distribution:** free; Public (or Unlisted to hand out the link, or Private to the Workspace
   domain). Submit for review.
6. After it is approved: put the store link in the README's Install section. For a team, force
   install it by its ID in the Google Admin console (Chrome → Apps & extensions).

To update: raise `version` in `extension/manifest.json`, push, download the new release's zip,
upload it, submit.

## Store listing

**Name:** New Tab

**Summary** (132 characters at most):

> Your bookmarks as your new tab: tabs of icon tiles, short links in the address bar, and a sky clock with the forecast.

**Category:** Productivity → Workflow & Planning

**Language:** English

**Description:**

```
Your bookmarks are already organised. This makes them your new tab.

Every folder on your bookmarks bar becomes a tab; every folder inside it becomes a card of icons. Nothing to import and no account: the page is drawn from Chrome's own bookmarks, so it is the same on every computer you sign in to, and removing it loses nothing.

NOTHING BOOKMARKED YET? IT STARTS YOU OFF
With an empty bookmarks bar, the page offers three ways in, right where your links will go:
• A starter set, in one press
• A bookmarks file from another browser
• A prompt that has your own assistant ask what you use and write that file
Then say where you are (this computer's location, or type a city), and type a short name in the address bar: stripe/ opens Stripe, mail/invoice searches your mail.

LAUNCH
• Spaces, collections and groups, straight from the bookmarks bar; make and rename them on the page
• A search bar (press /): type and everything you keep is filtered down to what matches, in any space, with your open tabs; it takes short links too
• Links as icon tiles, or as a list with each link's short name beside it
• Drag to reorder links, cards and tabs; the bookmarks bar changes with you
• Open a whole collection as one named tab group

TYPE, DON'T CLICK
• Every bookmark gets a short name the moment you save it: stripe/ opens Stripe
• Add words to search that site: stripe/refund policy
• Google's apps and Claude are always there and search inside themselves: mail/invoice from the printer, cal/dentist, drive/contract, docs/ sheets/ slides/ keep/, claude/what should I ask
• Chrome's own pages have names too: history/that recipe, downloads/invoice, settings/cookies
• Add your own: any name to any address

PICK UP WHERE YOU LEFT OFF
• Up next: pages to come back to, saved with one click, Alt+Shift+S or a right-click
• Open tabs: switch, reorder, close, or file one into a collection
• Notes: a scratch box that follows your Chrome profile

LOOK UP
• The sun's real path across the day, the three twilights, and the moon in its true phase
• Sunrise, sunset and the radar for where you are, at the top
• The page turns dark when night falls where you are; or hold it light or dark, and pick an accent
• Forecast, hourly chart, seven days and radar from the National Weather Service (United States)

CHECK, WHEN YOU WANT TO
• A Tools tab that shows how you look from outside: where your traffic comes out and whether your clock agrees, a WebRTC leak check, whose servers answer your DNS lookups, a speed reading, the fingerprint a tracking script would give this browser, and how Chrome's own privacy switches are set
• Written for people who have never heard those words: each answer says what it is, what was found, what it means and what to do, which is often nothing
• A plain list of what a VPN, secure DNS, a tracker blocker and a private window each change and don't. Kinds, not products: nothing is sold or recommended for money
• Opening that tab runs the check; no other part of the page makes those calls

PRIVATE BY CONSTRUCTION
• No account, no server, no analytics, no ads, no affiliate links
• Your links stay Chrome bookmarks
• Four extras (unread mail count, recent Google files, closed tabs and other devices, most visited) are off until you switch them on

Free and open source.
```

**Screenshots** (1280×800, sample data): `2-space.png`, `13-bare.png`, `7-today-night.png`,
`10-shortcuts.png`, `11-tools.png`.

## Privacy tab

**Single purpose:**

> A launcher for your bookmarks: it shows them as the new tab page and opens them by short name
> from the address bar, with the time, sky and weather for where you are.

**Permission reasons:**

| Permission | Reason |
|---|---|
| `bookmarks` | The page is drawn from the bookmarks bar, and dragging, renaming, adding or removing a tile changes the bookmark. "Up next" is a bookmarks folder. |
| `contextMenus` | Adds "Add to Up next" to the right-click menu of a page or a link. |
| `tabs` | Lists the window's open tabs so one can be switched to, closed, reordered or saved as a bookmark; opens a collection's links. |
| `tabGroups` | "Open all" opens a collection as one named tab group. |
| `webNavigation` | Notices when the user types one of their short links (for example `mail/`) in the address bar, to send the tab to the bookmark it names. No browsing data is stored or sent. |
| `search` | When the user types words after a bookmark's short name (for example `stripe/refund policy`), runs that search on the user's own default search engine through `chrome.search.query`. It does not read or change the search setting. |
| `storage` | Keeps the user's short names, their own shortcuts, their notes, their choice of light, dark, accent and tiles or a list, the place they set and a cache of the forecast and icons. |
| `geolocation` | On the first new tab and when the user clicks "Use this computer's location", to show sunrise, sunset and the local forecast. Chrome shows no location prompt on a new tab page, so the permission is declared. If the computer refuses, the page falls back to the city of the network connection (marked approximate), and the user can type a place instead. |
| Host `api.weather.gov` | Fetches the forecast for the user's place from the National Weather Service. |
| Optional `history` | Only if the user switches on "Recent files": lists the Google Docs, Sheets and Slides they opened lately. Read locally; nothing is sent. |
| Optional `privacy` | Only when the user opens "Chrome's privacy switches" on the Tools tab: reads Chrome's privacy settings to show how each is set. The one it can change is the WebRTC IP handling policy, which has no switch in Chrome's settings, and only when the user picks a value; choosing the default clears it. |
| Optional `sessions` | Only if the user switches on "Closed tabs and other devices": lists recently closed tabs to reopen, and the tabs open on the user's other signed-in devices. Read locally; nothing is sent. |
| Optional `topSites` | Only if the user switches on "Most visited": shows a row of the user's most visited sites. Read locally. |
| Optional host `mail.google.com` | Only if the user switches on "Unread mail": reads the unread count from Gmail's inbox feed. Only the number is kept, locally. |

**Remote code:** No. All code is in the package.

**Data use** (tick what applies; a person certifies):

- *Location:* yes. The place the user sets, rounded to about a kilometre, is sent to the National
  Weather Service to fetch their forecast. When the computer won't give a location, BigDataCloud
  is asked which city the connection's IP address is in. Not sold, not used for anything else.
- *Web history:* only with the optional "Recent files" switch; read on the device, never sent.
- *Personal communications:* only with the optional "Unread mail" switch; the count alone, kept
  on the device.
- *User activity / web history:* also with the optional "Closed tabs and other devices" and
  "Most visited" switches; read on the device, never sent.
- The Tools tab's checks contact ipleak.net and two STUN servers only when the user opens that
  tab, and Cloudflare only when the user runs the speed reading; the answers are shown and not
  stored. Its fingerprint is computed on the device
  and never sent.
- Everything else: no.
- Certify: not sold to third parties; not used for purposes unrelated to the single purpose; not
  used for creditworthiness or lending.

**Test instructions:** none needed. No sign-in. Open a new tab; if the bookmarks bar is empty, add
a folder with a link in it.

## What a reviewer may ask about

- **New tab page plus address-bar short links.** Both are the one purpose: launching the user's
  bookmarks. The short links only ever resolve to the user's own bookmarks, eight named Google and
  Claude addresses, shortcuts the user typed in, or a search for the bookmark's site on the
  user's own default search engine.
- **Reading a search.** A short link typed with spaces is sent by Chrome to the search engine;
  the extension redirects that one navigation when the search starts with one of the user's short
  names and a slash. It does not change the default search engine or any setting.
