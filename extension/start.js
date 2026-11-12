// Start here: the page a new person lands on, and can come back to from Settings. Four things
// in the order they pay off, each with the thing to press beside it, and a tick once it is
// true: the ticks are read from the bookmarks, the saved place and what has been used, not
// from having pressed anything here.
import { $, el } from "./dom.js";
import { barChildren, leaves, aliasTable, aliasFor, nextFolder } from "./shared.js";
import { getPlace, placeForm } from "./place.js";
import { setupRows } from "./setup.js";

const many = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
let page = null;
let ways = null;
let where = null;

export function wireStart(hooks) {
  page = hooks;
  // Built once: a form half filled in must survive the page being redrawn around it.
  ways = el("div", "setup");
  ways.id = "startWays";
  ways.append(...setupRows(page));
  where = placeForm(page.placed);
}

function step(done, title, state, ...body) {
  const li = el("li", done ? "step done" : "step");
  const mark = el("span", "step-mark", done ? "✓" : "");
  mark.setAttribute("aria-hidden", "true");
  const head = el("div", "step-head");
  head.append(el("h2", null, title), el("span", "step-state", state));
  const main = el("div", "step-main");
  main.append(head, ...body);
  li.append(mark, main);
  return li;
}
const say = (text) => el("p", "step-say", text);
const press = (label, run, cls = "btn") => { const b = el("button", cls, label); b.type = "button"; b.onclick = run; return b; };

export async function renderStart() {
  const kids = await barChildren();
  const folders = kids.filter((k) => !k.url);
  const links = kids.flatMap((k) => (k.url ? [k] : leaves(k)));
  const [place, table, next, { usedShort, guide }] = await Promise.all([getPlace(), aliasTable(), nextFolder(), chrome.storage.sync.get(["usedShort", "guide"])]);
  const has = { links: links.length > 0, place: !!place, typed: !!usedShort, kept: !!next };

  // 1. links
  const hand = say("Or build it by hand: the pencil at the top right adds a space, a collection and a link, and ⌘D (Ctrl+D) on any page bookmarks it into a folder, where it shows here at once.");
  let bring = [ways, hand];
  if (has.links) {
    const more = el("details", "step-more");
    more.append(el("summary", null, "Bring in more"), ways, hand);
    bring = [more];
  }
  const one = step(has.links, "Bring in your links", has.links ? `${many(links.length, "link")} in ${many(folders.length, "space")}` : "",
    say("This page is your bookmarks bar, laid out: each folder on the bar is a tab at the top, and each folder inside it a card of links. Nothing is copied anywhere, so removing the extension loses nothing."), ...bring);

  // 2. the place
  const rough = !!place && place.source === "network";
  const two = step(has.place, "Say where you are", !place ? "" : rough ? `Estimated from your network: ${place.name || "nearby"}` : `Set${place.name ? ` to ${place.name}` : " from this computer"}`,
    say("The sky, the forecast and turning dark at dusk are drawn for one place. It stays on this computer."),
    ...(place && !rough ? [press("Change it on Today", page.changePlace, "mini lead")] : [where]));

  // 3. short names
  const names = ["mail/", "cal/", ...links.map((l) => aliasFor(l, table)).filter((a) => a && !["mail", "cal"].includes(a)).slice(0, 3).map((a) => `${a}/`)];
  const chips = el("div", "step-chips");
  chips.append(...names.map((n) => press(n, () => page.tryShort(n), "key eg")), press("mail/invoice", () => page.tryShort("mail/invoice from the printer"), "key eg"), press("All your short names", page.shortcuts, "mini lead"));
  const three = step(has.typed, "Type a short name", has.typed ? "You have typed one" : "",
    say("Every link gets a short name from its own name. Type it in the address bar and press Enter to go there; add words after the slash to search that place. Press one of these to see what it would do."), chips);

  // 4. Up next
  const four = step(has.kept, "Keep a page for later", has.kept ? "Up next is in use" : "",
    say("Pin this extension's button: the puzzle piece in Chrome's toolbar, then the pin beside New Tab. One press on it (or Alt+Shift+S, or a right-click on any page) files the page you are on under Up next, the list at the right of every space. Tick it off when you have been back."));

  const done = Object.values(has).filter(Boolean).length;
  $("startCount").textContent = done === 4 ? "All four done." : `${done} of 4 done.`;
  $("startSteps").replaceChildren(one, two, three, four);

  const also = (label, text, run) => { const d = el("div", "also"); d.append(press(label, run), el("span", "cap", text)); return d; };
  $("startAlso").replaceChildren(
    also("Find", "Any link, in any space. Press / on this page.", page.find),
    also("Today", "The sky, the next 24 hours, the week, and the clocks of cities you add.", page.today),
    also("Tools", "Where your connection comes out, what it gives away, and what to do about it.", page.tools),
    also("Settings", "Light or dark, an accent, tiles or a list, and extras that are off until you want them.", page.settings),
  );
  const hidden = guide === "hidden";
  $("startHide").textContent = hidden ? "Show the Start tab again" : "Hide the Start tab";
  $("startHide").onclick = () => chrome.storage.sync.set({ guide: hidden ? "shown" : "hidden" });
}
