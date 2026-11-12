# What New Tab is for

The reasoning behind the product: who it serves, what they are trying to do at the moment a new
tab opens, and how each of those moments goes. Read it before adding a feature. The README says
what the product does; this says why, and what it refuses to become.

Last walked through end to end at 4.0.0 (2026-11-12).

## Who it is for

Someone who works in a browser and has the same thirty to a hundred places to go: a founder with
a dozen dashboards, an operator, a student, a freelancer with a folder per client. They already
bookmark things. They do not want another account, another library to keep tidy, or a monthly
price for seeing their own links.

Not for: teams that need shared, permissioned link collections; people who keep hundreds of tabs
open as their memory and want sessions restored with history; people who want a wallpaper.

## The moment

A new tab is opened dozens of times a day, and the person wants one of four things:

1. **Go somewhere known**, in under a second.
2. **Find something** inside a place they use.
3. **Put down something** they will come back to.
4. **Glance**: what time is it, how much daylight is left, do I need a coat.

Everything on the main page serves one of those. Anything that serves none of them is noise.

A fifth want is real but occasional, and only for some: **check** that the connection and the
browser are what they should be (am I on the VPN, is anything leaking, how fast is this). It has
its own tab, Tools, so it costs the main page nothing.

## What the market offers, by kind

- **The browser's own new tab:** a search box and a row of most-visited sites. Fast, but it
  holds ten things and has no structure.
- **Dashboard new tabs:** a photograph, a clock, a greeting, the weather. Calm, but shallow on
  links, and the useful parts (forecast, calendar, to-dos) tend to sit behind a subscription.
- **Collection and tab managers:** real organisation, but in the product's own library and
  account. Links are imported, then drift from the browser's bookmarks; free plans cap what
  can be saved.
- **Speed dials and start-page builders:** grids and widgets, again with their own store, and
  sync is usually the paid part.
- **Short-link ("go link") services:** type a name, land on the page. Built for companies: a
  server, an administrator, someone to create each link.

Checked once more before the store (2026-11-12), by what these kinds keep offering and what
their users keep asking for:

- **Taken, because most people with more than a screenful of links want it:** filtering
  everything kept down to what matches as it is typed, wherever it is filed (Find, on `/`);
  and a compact list as well as tiles, which here also shows each link's short name. Collection managers lead with search;
  the plainest start pages are a text list and nothing else, and people choose them for that.
- **Already here, and what collection managers are faulted for lacking:** no account, no cap
  on what can be saved, nothing lost if a service goes away, adding an open tab to a
  collection that exists.
- **Refused:** tags (a bookmark has none, so they would be this page's own library); a
  wallpaper, a quote, a to-do list, widgets to arrange, which most dashboards have and which
  serve none of the four moments; shared or team collections, which need a server.

## The gap, and how this fills it

| What people want | What they are usually asked to accept | What New Tab does |
|---|---|---|
| Their links organised and one click away | A second library, an import, an account | The page **is** the bookmarks bar. A folder is a tab, a folder inside it a card. Nothing is copied, so nothing drifts, and removing the extension loses nothing |
| The same page on every computer | A sync subscription | Chrome already syncs bookmarks; names, shortcuts and the note ride on Chrome's own synced storage |
| To type a name and arrive | A go-link server and someone to maintain it | Every bookmark gets a short name from its own name, automatically. Words after it search that place |
| Time, daylight and weather at a glance | A photo and a paywall | A sky drawn from astronomy, a forecast from a public service, no account |
| To trust it | A privacy policy about a server | There is no server. Four public services are called, each with the least it needs |

The one-line position: **the launcher that has no library of its own.**

## Why someone picks this one

Asked as "what would make a person keep it after the first day", in the order it matters:

1. **Nothing to lose and nothing to learn.** It shows the bookmarks they already have, in the
   folders they already made, and removing it puts nothing at risk. Every other organised new
   tab starts by asking for an import and an account.
2. **Typing beats clicking, with no setup.** Short names come from the bookmarks themselves.
   Go-link tools give this to companies; nothing gives it to one person for free.
3. **It answers real questions on the page.** How much daylight is left, what the weather does
   at six, what time that is in Tokyo, whether the VPN is leaking and what to do about it.
   Each is one look, drawn here, with no site to visit and nothing to buy.
4. **It is plainly honest.** No account, no server, no tracking, no upsell, open source, and
   each permission that reads something personal is off until asked for.

What is deliberately not done to earn money from it: affiliate links (to VPNs or anything
else), sponsored tiles, a paid tier. A recommendation the page is paid for would undo point 4.

## The door left open

Earning nothing is the choice for the first public version, not a principle. If that changes,
these are the ways that fit the product, and the rules each would have to keep:

- **Named recommendations on Tools.** The page already says what a VPN, secure DNS, a tracker
  blocker and a private window each change (`GAPS` in `extension/tools.js`). That list is the
  one place a named product could ever go. It would be marked as paid where it is paid, shown
  to everyone the same, never placed by who pays most, and never on the links page. The store
  requires that an affiliate programme be described on the listing, in the page itself and
  before installation, that it gives the user a direct benefit, and that the user acts before
  each affiliate link or code is used
  ([Chrome Web Store affiliate ads policy](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads),
  checked 2026-11-12). Disclosure law is a question for an attorney before it is switched on.
- **Paying for what costs money to run.** A forecast outside the United States, or calendar
  and tasks on the page, would need a paid service or a server. Either could be an extra a
  person pays for, with everything that exists today staying free.
- **Being asked.** A plain "support this" link.

What is not on the table: selling or sharing anything about what people bookmark, visit or
type; advertisements on the page; putting an affiliate code on a link the person saved.

## Each flow, as the person meets it

**First run.** A new tab opens on their own bookmarks, already arranged. There is no setup
screen, no guide and no tab for one: both were tried at 3.9.0 and cut, because a page that
greets someone who is already set up is in the way every day after. The page asks the
computer where it is, without a prompt to dismiss. If the computer refuses, it uses the
network's city, says so, and says how to get the exact spot. If that fails, or the network is
in another time zone (a VPN), it asks for a city, ZIP or address.

**Nothing bookmarked.** Most people who install this have no folders on their bar. For them
the links area itself says so and offers three ways in: a starter set in one press, a
bookmarks file from another browser, or a prompt to paste into an assistant, which interviews
the person and writes that file. The strip above it and the side beside it are the same as
ever, so the page they will have is the page they see. *Held to:* something useful on screen
before any question is answered; a file is read as untrusted (web links only, nothing added
twice, one Undo for all of it); the page itself never calls a model; and all of it is gone
the moment there is a folder on the bar.

**Go somewhere.** Click a tile, or type its short name and Enter. Names are shown on the tiles
while editing and listed on the Shortcuts page. *Held to:* no name ever has to be set up, and
each place has exactly one name on the Shortcuts page.

**Learn the names.** The Shortcuts page lists them, each once, with an example of a search.
A box to try one in was added at 3.7.0 and cut at 4.0.0: the address bar is where they are
typed, and a stand-in for it taught nothing the list didn't.

**Find something you kept.** The box at the top (or `/`) filters every link in every space and
the open tabs down to what matches, in place of the page while something is typed. *Held to:*
it is a filter over what the person keeps, not a web search; Esc or going anywhere puts the
page back.

**Find something.** Words after a short name search: inside the app for Google's apps and
Claude, wherever the person said for shortcuts they added, and on the web for that site for
every other bookmark. Plain web search is left to the address bar, which already does it.
*Held to:* one rule, "words after the slash search that place".

**Put something down.** ⌘D saves the page into a folder, and it appears as a tile at once with
its icon and names. The toolbar button (Alt+Shift+S) drops the page into Up next without
choosing a folder. An open tab can be dragged onto a card; "Save all" files the window.
*Held to:* saving never opens this page or asks a question.

**Tidy up.** Drag tiles, cards and space tabs at any time. The pencil adds a space, a
collection, a group or a link, renames any of them by clicking the name, and removes links with
Undo. Folders are deleted only when empty; the bookmark manager, one click away, does bulk
work. *Held to:* one click never removes more than one link or one empty folder.

**Glance.** The strip across every space has the time, the sun's arc, the temperature and a
radar still; Today has the sky with sunrise and sunset and the radar beside it at the top,
because where the person is, now, is most of what they came for, then the week. Under the sky
the next 24 hours run as a strip that can be dragged to any hour. Someone who deals with
people elsewhere adds those cities: each shows its clock on Today and in the strip on every
space, and pressing one draws the sky and the forecast for it, in its own time, until "Here"
is pressed. Where the person is doesn't change, so light and dark and the Tools page still
go by home. A map of day and night was tried at 3.8.0 and cut: cities that could not be
picked and showed nowhere else were decoration. The page turns dark
at dusk where the person is. On a trip, a place taken from the computer follows it (at once
when the time zone changes); a typed place is never moved, only asked about. *Held to:* drawn
at once from what is saved; the network is never waited on.

**Jot.** A synced scratch box. Expanded, it can be a few pages, copied or downloaded; small,
it is only a box. It is not a notes app: no folders, no formatting; `keep/` is one keystroke
away.

**Change something.** One pencil, top right, wherever there is something to change: on a
space the links and folders, on Today where you are and your cities, on Shortcuts the short
names and your own. With it off those pages are only read. Tools has nothing to change and
no pencil.

**Make it yours.** Settings, at the top right, is one sheet: light and dark, one of four
accents, tiles or a list, the three ways to bring links in, the extras, and the pages of
Chrome's own settings this page leans on. Esc or a press outside puts it away, as it does the
expanded note. *Held to:* no
wallpaper, no layout switches; a choice has to earn its row.

**Check.** The Tools tab answers "how do I look from outside" on the page itself: where the
traffic comes out, whether the clock agrees, what WebRTC and DNS give away, a speed reading,
the fingerprint a tracking script would compute, and how Chrome's own privacy switches are set.
*Held to:* opening the tab is the asking, so the check runs then and lands as one sentence and a
map; nothing else on the page makes these calls, and what spends data (speed) waits for a
press; a check is done here and drawn here, or it is left out. Every finding is written for
someone who has never heard the word: what was looked at, what was found, what it means, and
what to do, which is often nothing and says so. A sign (red, amber, green) is only given to
what matters and can be acted on. A list of links to other people's test pages is not a feature. The one thing
pointed elsewhere is how rare a fingerprint is, which needs a sample of other browsers.

**What only some want.** Unread mail, recent files, closed tabs and other devices, most
visited: each is an extra, off until switched on, because each needs a permission Chrome warns
about.

**Leave.** Uninstall. Every link is where it always was, including the Up next folder.

## What it refuses to be

A task manager, a notes app, a search box, a news feed, a wallpaper, a sessions database, a
team product, a shop window. Each is a real want that something else serves better, and each would make the page
slower to read. When a request arrives, the test is whether it serves one of the four moments
without adding a second library, an account or a wait.

## Known weak spots

- **Forecast and radar are United States only** (National Weather Service). The sky works
  everywhere. This is the largest gap for anyone abroad.
- **Chrome on a computer only.** Phones cannot run extensions; other Chromium browsers are
  untested.
- **No sharing.** A collection cannot be handed to someone else, except as an exported
  bookmarks file.
- **Calendar and tasks are a click away, not on the page.** Showing them needs a Google
  sign-in for the extension; it is planned as an extra that is off by default.
- **Eight short names are reserved** for Google's apps and Claude. A bookmark called "Docs"
  that is something else has to be named by hand.
- **A VPN exit in your own time zone passes as your city**, marked approximate. One in another
  time zone is caught, and the page asks instead.
