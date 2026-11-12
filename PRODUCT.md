# What New Tab is for

The reasoning behind the product: who it serves, what they are trying to do at the moment a new
tab opens, and how each of those moments goes. Read it before adding a feature. The README says
what the product does; this says why, and what it refuses to become.

Last walked through end to end at 3.3.0 (2026-11-11).

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

Everything on the page serves one of those. Anything that serves none of them is noise.

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

## The gap, and how this fills it

| What people want | What they are usually asked to accept | What New Tab does |
|---|---|---|
| Their links organised and one click away | A second library, an import, an account | The page **is** the bookmarks bar. A folder is a tab, a folder inside it a card. Nothing is copied, so nothing drifts, and removing the extension loses nothing |
| The same page on every computer | A sync subscription | Chrome already syncs bookmarks; names, shortcuts and the note ride on Chrome's own synced storage |
| To type a name and arrive | A go-link server and someone to maintain it | Every bookmark gets a short name from its own name, automatically. Words after it search that place |
| Time, daylight and weather at a glance | A photo and a paywall | A sky drawn from astronomy, a forecast from a public service, no account |
| To trust it | A privacy policy about a server | There is no server. Four public services are called, each with the least it needs |

The one-line position: **the launcher that has no library of its own.**

## Each flow, as the person meets it

**First run.** A new tab opens on their own bookmarks, already arranged; there is no setup
screen. The page asks the computer where it is, without a prompt to dismiss. If the computer
refuses, it uses the network's city, says so, and says how to get the exact spot. If that fails
it asks for a city, ZIP or address. With no folders on the bar, the page says so and offers
"+ New space". *Held to:* something useful on screen before any question is answered.

**Go somewhere.** Click a tile, or type its short name and Enter. Names are shown on the tiles
while editing and listed on the Shortcuts page. *Held to:* no name ever has to be set up, and
each place has exactly one name on the Shortcuts page.

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
radar still; Today has the whole sky, the hourly forecast and seven days. The page turns dark
at dusk where the person is. *Held to:* drawn at once from what is saved; the network is never
waited on.

**Jot.** One synced scratch box. It is not a notes app; `keep/` is one keystroke away.

**Leave.** Uninstall. Every link is where it always was, including the Up next folder.

## What it refuses to be

A task manager, a search box, a feed, a wallpaper, a theme picker, a sessions database, a team
product. Each is a real want that something else serves better, and each would make the page
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
- **The network estimate follows a VPN.**
