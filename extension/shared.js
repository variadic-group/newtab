// Shared by the new tab page and the background worker: where spaces come from, and how a typed
// short link (mail/, cal/, claude/what-to-ask) resolves to an address.

// The short links that exist whatever is bookmarked: Google's apps and Claude. Words after the
// slash search inside the app. `own` says which bookmark is the app's own front door: if you
// have one, it carries the short name (and is where the name opens) rather than getting a
// second name of its own. Plain web search is not here: the address bar already does that.
const home = (path) => new RegExp(`^https://docs\\.google\\.com/${path}/(u/\\d+/)?([?#]|$)`);
export const BUILTIN = {
  mail: { own: /^https:\/\/mail\.google\.com\//, url: "https://mail.google.com/", search: "https://mail.google.com/mail/u/0/#search/%s", label: "Gmail", example: "mail/invoice from the printer" },
  cal: { own: /^https:\/\/calendar\.google\.com\//, url: "https://calendar.google.com/", search: "https://calendar.google.com/calendar/u/0/r/search?q=%s", label: "Google Calendar", example: "cal/dentist" },
  drive: { own: /^https:\/\/drive\.google\.com\//, url: "https://drive.google.com/", search: "https://drive.google.com/drive/search?q=%s", label: "Google Drive", example: "drive/contract" },
  docs: { own: home("document"), url: "https://docs.google.com/document/", search: "https://docs.google.com/document/u/0/?q=%s", label: "Google Docs", example: "docs/board minutes" },
  sheets: { own: home("spreadsheets"), url: "https://docs.google.com/spreadsheets/", search: "https://docs.google.com/spreadsheets/u/0/?q=%s", label: "Google Sheets", example: "sheets/budget" },
  slides: { own: home("presentation"), url: "https://docs.google.com/presentation/", search: "https://docs.google.com/presentation/u/0/?q=%s", label: "Google Slides", example: "slides/pitch" },
  keep: { own: /^https:\/\/keep\.google\.com\//, url: "https://keep.google.com/", search: "https://keep.google.com/#search/text=%s", label: "Google Keep", example: "keep/gift ideas" },
  claude: { own: /^https:\/\/claude\.ai\/(new\/?)?([?#]|$)/, url: "https://claude.ai/new", search: "https://claude.ai/new?q=%s", label: "Claude", example: "claude/draft a reply to this" },
};

// Chrome's own pages have names too, and words after one search inside the page. These are not
// reserved the way the apps above are: a bookmark with the same name wins.
export const CHROME_PAGES = {
  history: { url: "chrome://history/", search: "chrome://history/?q=%s", label: "History", example: "history/that recipe" },
  downloads: { url: "chrome://downloads/", search: "chrome://downloads/?q=%s", label: "Downloads", example: "downloads/invoice" },
  bookmarks: { url: "chrome://bookmarks/", search: "chrome://bookmarks/?q=%s", label: "Bookmark manager", example: "bookmarks/tax" },
  settings: { url: "chrome://settings/", search: "chrome://settings/?search=%s", label: "Settings", example: "settings/cookies" },
  extensions: { url: "chrome://extensions/", label: "Extensions" },
  passwords: { url: "chrome://password-manager/passwords", label: "Passwords" },
};

export const NEXT_TITLE = "⏭️ Next";

export function slug(text) {
  return (text || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
}

// A title's leading words, squashed, shortest first: "Google Cloud console" gives google,
// googlecloud, googlecloudconsole.
function leads(title) {
  const words = (title || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.map((_, i) => words.slice(0, i + 1).join(""));
}

export function leaves(node) {
  const out = [];
  (function walk(x) { for (const c of x.children || []) c.url ? out.push(c) : walk(c); })(node);
  return out;
}

// Signed in to Chrome, bookmarks can live in the account's own storage, which has its own
// bookmarks bar beside the local one (folderType, Chrome 134+); read every bar.
export function bookmarkBars(root) {
  const top = root.children || [];
  const typed = top.filter((n) => n.folderType === "bookmarks-bar");
  return typed.length ? typed : top.slice(0, 1);
}

export async function barChildren() {
  const [root] = await chrome.bookmarks.getTree();
  return bookmarkBars(root).flatMap((bar) => bar.children || []);
}

export async function customAliases() {
  const { aliases = {} } = await chrome.storage.sync.get("aliases");
  return aliases;
}

async function allLinks() {
  return (await barChildren()).flatMap((n) => (n.url ? [n] : leaves(n)));
}

// Which bookmark carries each built-in name: the first one on the bar that is that app's front
// door (your Claude bookmark, not a page saved from inside Claude).
function claimsIn(links) {
  const claims = new Map();
  for (const [name, b] of Object.entries(BUILTIN)) {
    const mine = links.find((l) => b.own.test(l.url));
    if (mine) claims.set(name, mine.url);
  }
  return claims;
}
export async function claims() {
  return claimsIn(await allLinks());
}

// Every bookmark's short links, in the order they are shown: a name you set, a built-in name it
// carries, the fewest of its leading words that no other bookmark starts with ("admin" for
// "Admin console"; "googlecloud" and "googleads" when two start with Google), and its whole
// name squashed ("adminconsole"), which always works too.
export async function aliasTable() {
  const links = await allLinks();
  const custom = await customAliases();
  const table = new Map();
  for (const l of links) {
    const own = custom[l.url];
    if (own && !table.has(own)) table.set(own, l.url);
  }
  for (const [name, url] of claimsIn(links)) if (!table.has(name)) table.set(name, url);
  // Which addresses could go by each leading name. The same page saved twice is one address.
  const takers = new Map();
  for (const l of links) for (const n of leads(l.title)) takers.set(n, (takers.get(n) || new Set()).add(l.url));
  // A built-in name is never handed out automatically: it would show on the tile but open the built-in.
  const free = (n) => !BUILTIN[n] && !table.has(n);
  for (const l of links) {
    const short = leads(l.title).find((n) => takers.get(n).size === 1 && (free(n) || table.get(n) === l.url));
    if (short) table.set(short, l.url);
  }
  for (const l of links) {
    const s = slug(l.title);
    if (s && free(s)) table.set(s, l.url);
  }
  return table;
}

export function aliasFor(link, table) {
  for (const [alias, url] of table) if (url === link.url) return alias;
  return "";
}

// Shortcuts you add yourself on the Shortcuts page: a name and an address, with %s where any
// words typed after the slash should go.
export async function customLinks() {
  const { links = {} } = await chrome.storage.sync.get("links");
  return links;
}

// The words after the slash. In an address (mail/unpaid-invoice) they arrive encoded, with
// hyphens standing in for spaces; from a search or the keyword box they arrive as typed.
function wordsOf(rest, plain) {
  if (plain) return (rest || "").trim();
  let text = rest || "";
  try { text = decodeURIComponent(text); } catch { /* a stray % is not an encoding: keep the text as typed */ }
  return text.replace(/[-+_]/g, " ").trim();
}

// The site a link belongs to, for searching it: its host without a leading label that only says
// "the app" (dashboard.stripe.com is stripe.com), as long as a real site is left.
const APP = /^(www|app|apps|dashboard|dash|console|account|accounts|admin|my|portal|login|secure|manage|online|cloud|us|eu)\./;
function siteOf(url) {
  let h = new URL(url).hostname;
  while (APP.test(h) && h.split(".").length > 2 && h.replace(APP, "") !== "google.com") h = h.replace(APP, "");
  return h;
}

// Where a link goes with words after the slash. A built-in app's front door searches the app,
// whatever you have named it; any other link has no search of its own, so the web is searched
// for its site.
function reach(url, query) {
  if (!query) return url;
  const app = Object.values(BUILTIN).find((b) => b.own.test(url));
  return app ? app.search.replace("%s", encodeURIComponent(query)) : { search: `${query} site:${siteOf(url)}` };
}

// Where a typed short link goes: an address, or { search } for words to hand to the default
// search engine, or null if it isn't a short link. `plain` words came from a search, where only
// a whole name counts: a search for "and/or" must not open the one bookmark starting "and".
export async function resolve(name, rest, plain = false) {
  const key = name.toLowerCase();
  const query = wordsOf(rest, plain);
  const own = (await customLinks())[key];
  if (own) return own.includes("%s") ? own.replace("%s", encodeURIComponent(query)) : reach(own, query);
  const table = await aliasTable();
  const custom = await customAliases();
  if (Object.values(custom).includes(key) && table.has(key)) return reach(table.get(key), query);
  const b = BUILTIN[key];
  if (b && query) return b.search.replace("%s", encodeURIComponent(query));
  if (b) return (await claims()).get(key) || b.url;
  if (table.has(key)) return reach(table.get(key), query);
  const page = CHROME_PAGES[key];
  if (page) return query && page.search ? page.search.replace("%s", encodeURIComponent(query)) : page.url;
  if (plain) return null;
  const hits = [...table.keys()].filter((a) => a.startsWith(key));
  const urls = new Set(hits.map((a) => table.get(a)));
  return urls.size === 1 ? reach([...urls][0], query) : null;
}

// Next is a plain bookmarks folder under Other bookmarks, so Chrome syncs it and its order is the
// priority order. Signed in, prefer the account's Other bookmarks (syncing) over the local one.
export async function nextFolder(create = false) {
  const [root] = await chrome.bookmarks.getTree();
  const top = root.children || [];
  const others = top.filter((n) => n.folderType === "other");
  const homes = others.length ? others : top.slice(1, 2);
  for (const h of homes) {
    const f = (h.children || []).find((c) => !c.url && c.title === NEXT_TITLE);
    if (f) return f;
  }
  if (!create || !homes.length) return null;
  const home = homes.find((h) => h.syncing) || homes[0];
  return chrome.bookmarks.create({ parentId: home.id, title: NEXT_TITLE });
}

export async function addToNext({ title, url }, index) {
  const folder = await nextFolder(true);
  const kids = await chrome.bookmarks.getChildren(folder.id);
  if (kids.some((k) => k.url === url)) return false;
  await chrome.bookmarks.create({ parentId: folder.id, index, title: title || url, url });
  return true;
}
