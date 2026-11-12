# Privacy

**New Tab** is published by Variadic Group LLC. It has no server, no account and no
analytics: the publisher receives nothing from it. Everything below happens in your browser.

Last updated 2026-11-12.

## What it reads

| What | Why | Where it goes |
|---|---|---|
| Your bookmarks | To draw the page, and to change them when you drag, rename, add or remove | Nowhere. Changes are made to your own Chrome bookmarks |
| This window's open tabs (title, address, icon) | The Open tabs list, saving a tab, opening a collection as a tab group | Nowhere |
| Addresses you navigate to | To notice a typed short link (`mail/`, `claude/what to ask`) and send the tab where it points. Only one-word hosts and searches that begin with one of your short names are acted on | Nowhere. Nothing is kept |
| Where you are | Sun, moon, forecast and radar. The first new tab asks the computer for its location. If the computer won't say, the city your network connection appears to be in is used and marked approximate; if that fails too, or that city is in a different time zone from this computer's clock (as on a VPN), you type a place. A place taken from the computer or the network is checked again after six hours, or at once when the computer's time zone changes; a typed one stays put, and the page asks about it when the time zone changes. The time zone is read from the computer and sent nowhere. Rounded to two decimal places (about a kilometre) | The rounded point goes to the National Weather Service to fetch the forecast |

## What it sends, and to whom

| To | What | When |
|---|---|---|
| National Weather Service (`api.weather.gov`, `radar.weather.gov`) | Your rounded location, then the radar station nearest it | When the forecast is more than 20 minutes old and you open a new tab |
| BigDataCloud (`api.bigdatacloud.net`) | Nothing but the request itself: it answers with the city your IP address appears to be in | Only when the computer won't give its location: on the first new tab, when you press "Use this computer's location", and at most every six hours while the place is still an estimate. Never once you have typed a place |
| OpenStreetMap's Nominatim (`nominatim.openstreetmap.org`) | What you typed: a city, a ZIP code or an address | Only when you press Search in the location form |
| ipleak.net, run by AirVPN (`ipleak.net` and names under it) | The request itself, so it can say what address it sees you at, where that is and whose network it is. For DNS, four made-up names under `ipleak.net` are looked up so it can see which DNS servers came asking; each of those servers' addresses is then sent back to it to be named | Only when you open the Tools tab, or press Check again there. No other part of the page asks. Nothing is kept after the tab closes |
| Cloudflare (`speed.cloudflare.com`, `stun.cloudflare.com`) and Google's STUN server (`stun.l.google.com`) | Filler data for the speed reading; the STUN servers are asked what address they see, which is what WebRTC would show a site | The speed reading only when you press Run; the STUN servers when you open the Tools tab or press Check again |
| Your search engine, whichever Chrome is set to | The words you typed after a bookmark's short name, with `site:` and that bookmark's site | Only when you type words after a short name that has no search of its own (`stripe/refund policy`). Words after a well-known site's name (`translate/`, `yt/`) go straight to that site, as if you had typed them there |
| Google's icon service (`google.com/s2/favicons`, `gstatic.com`) | The host names of your bookmarks, one at a time | The first time a site's icon is needed; the answer is remembered |

Each of those services sees your IP address, as any website you visit does.

Words after a built-in name go to that app (`mail/invoice` to Gmail, `claude/…` to Claude), and
words after a shortcut you added go to the address you gave it.

A short link typed with spaces (`claude/what should I ask`) is first treated by Chrome as a
search. The extension redirects that search before the page loads, but the request may reach
your search engine for a moment. Type it with hyphens (`claude/what-should-i-ask`), or use
`claude` then Tab, and nothing is searched.

The fingerprint on the Tools tab is worked out on your computer from what the browser reports,
and is not sent anywhere or kept.

Nothing on the page calls a language model. The prompt in "Bring in your links" is text you
copy and paste into an assistant yourself; what you tell that assistant is between you and it.
A bookmarks file or a settings file you choose is read on your computer and goes nowhere.

## What it keeps

- **In Chrome's synced storage** (travels with your Chrome profile, through Google's sync): the
  short names you set, shortcuts you add, your notes, and your choice of light or dark, accent
  and tiles or a list.
- **In this browser only:** the place you set, the last forecast, which icons were found, the
  last space you opened, and tonight's dusk and dawn.

Removing the extension deletes all of it. Your bookmarks stay, including the `⏭️ Next` folder.

## Extras you can switch on

Each is off until you turn it on, and Chrome asks you for the permission at that moment.

- **Unread mail** reads the count from Gmail's inbox feed (`mail.google.com`) using your
  browser's own sign-in. Only the number is kept, on this computer.
- **Recent files** reads this browser's history for Google Docs, Sheets, Slides and Forms you
  opened in the last 30 days, to list them. Nothing is sent anywhere.
- **Closed tabs and other devices** reads Chrome's list of tabs you closed lately and of tabs
  open on the other devices signed in to this Chrome profile, to list them. Nothing is sent
  anywhere, and nothing is kept.
- **Most visited** reads Chrome's list of the sites you visit most, to show eight of them.
  Their host names go to Google's icon service for their icons, as your bookmarks' do.
- **Chrome's privacy switches** (asked for on the Tools tab) reads how Chrome's own privacy
  settings are set, to show them. It changes one, the route WebRTC may take, and only when you
  pick a different one; choosing Chrome's default hands the setting back.

## Contact

hello@variadicgroup.com
