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
3. **Store listing:** paste the text below; upload the five captioned images from
   `store/media/` (in their numbered order) and `store/media/promo-small-440x280.png`.
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

> Your bookmarks as your new tab: drag tiles, type short names like mail/, and see the sky and forecast where you are.

**Category:** Productivity → Workflow & Planning

**Language:** English

**Description:**

```
Your bookmarks, as your new tab. Tiles you can drag, short names you can type, and the sky over where you are. Free, no account, nothing to import.

YOUR BOOKMARKS ARE THE PAGE
Every folder on your bookmarks bar becomes a tab of icon tiles. Drag to arrange and Chrome's bookmarks change with you: the same on every computer, and nothing lost if you remove it.

TYPE A NAME, LAND THERE
Every bookmark gets a short name: stripe/ opens Stripe, mail/invoice searches your mail, translate/ hola translates, claude/ plan a trip asks. Thirty well-known sites work with nothing saved.

YOUR SKY, YOUR FORECAST
The sun's real path, sunrise, sunset and the moon, with the hourly forecast, the week and radar (United States). Point along the sky to see any moment of the next day. The page goes dark when night falls where you are.

ALSO IN THE BOX
• Up next: pages to come back to, in one click
• Open tabs and notes beside your links
• Search everything you keep, in every space
• Unread mail as a badge on your Gmail icon
• Sites you visit but haven't saved, ready to drag into a collection (optional)
• Tiles or a list; light, dark or following the sun
• Tools: does your VPN, DNS or WebRTC leak? In plain words, plus a speed test
• An empty bookmarks bar? A starter set, your old browser's bookmarks, or a prompt for your own assistant

PRIVATE BY CONSTRUCTION
No account, no server, no analytics, no ads. Your links stay Chrome bookmarks.

Free and open source.
```

**Promo video:** `store/media/promo-film.mp4` (25 s, 1920×1080), uploaded to YouTube as unlisted; paste its link in Global promo video. `store/media/promo-film-thumbnail.jpg` is its thumbnail. Made by `python3 store/video/build.py store/video/scenes.json store/media/promo-film.mp4` after `npm run media`.

**Store icon:** `store/media/store-icon-128.png` (96 px of artwork in 16 px of clear border, as the store asks). **Small promo tile:** `store/media/promo-small-440x280.png`. **Marquee:** `store/media/promo-marquee-1400x560.png`.

**Screenshots** (1280×800, sample data), in this order: `store/media/1-your-bookmarks.png`,
`2-short-links.png`, `3-today.png`, `4-tools.png`, `5-start.png`. Made by `npm run media`.

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
| Host `mail.google.com` | While a Gmail link is on the page, reads Gmail's inbox feed with the browser's own sign-in to show the unread count as a badge on it, with the newest five senders and subjects when pointed at. Kept locally, never sent. |
| Optional `privacy` | Only when the user opens "Chrome's privacy switches" on the Tools tab: reads Chrome's privacy settings to show how each is set. The one it can change is the WebRTC IP handling policy, which has no switch in Chrome's settings, and only when the user picks a value; choosing the default clears it. |
| Optional `topSites` | Only if the user switches on "Sites you visit but haven't saved": shows the most visited sites not already bookmarked, to drag into a collection. Read locally. |

**Remote code:** No. All code is in the package.

**Data use** (tick what applies; a person certifies):

- *Location:* yes. The place the user sets, rounded to about a kilometre, is sent to the National
  Weather Service to fetch their forecast. When the computer won't give a location, BigDataCloud
  is asked which city the connection's IP address is in. Not sold, not used for anything else.
- *Personal communications:* the unread count and the newest five unread senders and subjects
  from Gmail, read while a Gmail link is on the page; kept on the device, never sent.
- *User activity / web history:* only with the optional "Sites you visit but haven't saved"
  switch; Chrome's most visited list, read on the device, never sent.
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
