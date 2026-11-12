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
  // Typed with spaces, the words are as typed, so "usb-c cable" keeps its hyphen. With none,
  // hyphens stand for the spaces an address can't hold.
  return /\s/.test(text.trim()) ? text.trim() : text.replace(/[-+_]/g, " ").trim();
}

// The site a link belongs to, for searching it: its host without a leading label that only says
// "the app" (dashboard.stripe.com is stripe.com), as long as a real site is left.
const APP = /^(www|app|apps|dashboard|dash|console|account|accounts|admin|my|portal|login|secure|manage|online|cloud|us|eu)\./;
function siteOf(url) {
  let h = new URL(url).hostname;
  while (APP.test(h) && h.split(".").length > 2 && h.replace(APP, "") !== "google.com") h = h.replace(APP, "");
  return h;
}

// Well-known sites whose own search or ask box can be filled from an address. A bookmark on
// one of these sends the words after its short name there, in place of a web search for the
// site. The ones with names also work with no bookmark at all (translate/good morning), and
// like Chrome's pages they are not reserved: a bookmark or a shortcut of yours by that name
// wins. {origin} is the bookmark's own site, for ones that live on many (amazon.de, fr.wikipedia.org);
// {lang} is the language this browser is in.
const lang = () => (chrome.i18n.getUILanguage() || "en").split("-")[0];
export const SITES = [
  { names: ["translate"], label: "Google Translate", url: "https://translate.google.com/", host: /^translate\.google\./, search: "https://translate.google.com/?sl=auto&tl={lang}&text=%s&op=translate", example: "translate/buenos días" },
  { names: ["maps"], label: "Google Maps", url: "https://www.google.com/maps", host: /^maps\.google\./, path: /^\/maps/, search: "https://www.google.com/maps/search/%s", example: "maps/coffee near me" },
  { names: ["youtube", "yt"], label: "YouTube", url: "https://www.youtube.com/", host: /(^|\.)youtube\.com$/, search: "https://www.youtube.com/results?search_query=%s", example: "yt/how to fold a fitted sheet" },
  { names: ["wiki"], label: "Wikipedia", url: "https://{lang}.wikipedia.org/", host: /\.wikipedia\.org$/, search: "{origin}/w/index.php?search=%s", example: "wiki/apollo 11" },
  { names: ["github", "gh"], label: "GitHub", url: "https://github.com/", host: /^github\.com$/, search: "https://github.com/search?q=%s", example: "gh/tetris in rust" },
  { names: ["chatgpt", "gpt"], label: "ChatGPT", url: "https://chatgpt.com/", host: /^chatgpt\.com$/, search: "https://chatgpt.com/?q=%s", example: "gpt/plan a week of dinners" },
  { names: ["perplexity", "pplx"], label: "Perplexity", url: "https://www.perplexity.ai/", host: /(^|\.)perplexity\.ai$/, search: "https://www.perplexity.ai/search?q=%s", example: "pplx/latest on fusion power" },
  { names: ["amazon"], label: "Amazon", url: "https://www.amazon.com/", host: /(^|\.)amazon\.[a-z.]{2,6}$/, search: "{origin}/s?k=%s", example: "amazon/usb-c cable" },
  { names: ["reddit"], label: "Reddit", url: "https://www.reddit.com/", host: /(^|\.)reddit\.com$/, search: "https://www.reddit.com/search/?q=%s", example: "reddit/best carry-on" },
  { names: ["imdb"], label: "IMDb", url: "https://www.imdb.com/", host: /(^|\.)imdb\.com$/, search: "https://www.imdb.com/find/?q=%s", example: "imdb/the third man" },
  { names: ["hn"], label: "Hacker News", url: "https://news.ycombinator.com/", host: /^news\.ycombinator\.com$/, search: "https://hn.algolia.com/?q=%s", example: "hn/sqlite" },
  { names: ["npm"], label: "npm", url: "https://www.npmjs.com/", host: /(^|\.)npmjs\.com$/, search: "https://www.npmjs.com/search?q=%s", example: "npm/date picker" },
  { names: ["mdn"], label: "MDN", url: "https://developer.mozilla.org/", host: /^developer\.mozilla\.org$/, search: "https://developer.mozilla.org/search?q=%s", example: "mdn/flexbox gap" },
  // Known by their site only: no name is given to them here.
  { names: [], label: "X", host: /^(x|twitter)\.com$/, search: "https://x.com/search?q=%s" },
  { names: [], label: "LinkedIn", host: /(^|\.)linkedin\.com$/, search: "https://www.linkedin.com/search/results/all/?keywords=%s" },
  { names: [], label: "Stack Overflow", host: /^stackoverflow\.com$/, search: "https://stackoverflow.com/search?q=%s" },
  { names: [], label: "Spotify", host: /^open\.spotify\.com$/, search: "https://open.spotify.com/search/%s" },
  { names: [], label: "Netflix", host: /(^|\.)netflix\.com$/, search: "https://www.netflix.com/search?q=%s" },
  { names: [], label: "eBay", host: /(^|\.)ebay\.[a-z.]{2,6}$/, search: "{origin}/sch/i.html?_nkw=%s" },
  { names: [], label: "Etsy", host: /(^|\.)etsy\.com$/, search: "https://www.etsy.com/search?q=%s" },
  { names: [], label: "PyPI", host: /^pypi\.org$/, search: "https://pypi.org/search/?q=%s" },
  { names: [], label: "Google Scholar", host: /^scholar\.google\./, search: "{origin}/scholar?q=%s" },
  { names: [], label: "Google News", host: /^news\.google\./, search: "https://news.google.com/search?q=%s" },
  { names: [], label: "Google Play", host: /^play\.google\./, search: "https://play.google.com/store/search?q=%s" },
  { names: [], label: "DuckDuckGo", host: /^duckduckgo\.com$/, search: "https://duckduckgo.com/?q=%s" },
  { names: [], label: "Bing", host: /(^|\.)bing\.com$/, search: "https://www.bing.com/search?q=%s" },
];
const filled = (text, origin) => text.replace("{origin}", origin).replace("{lang}", lang());
// The well-known site a link is on, if it is on one.
export function siteFor(url) {
  const u = new URL(url);
  return SITES.find((s) => s.host.test(u.hostname) || (s.path && /(^|\.)google\.[a-z.]{2,6}$/.test(u.hostname) && s.path.test(u.pathname))) || null;
}
// The ones with names, by name: where each goes with no words, and with them.
export const KNOWN = Object.fromEntries(SITES.flatMap((s) => s.names.map((n) => [n, s])));
const known = (s, query) => (query ? filled(s.search, new URL(filled(s.url, "")).origin).replace("%s", encodeURIComponent(query)) : filled(s.url, ""));

// Where a link goes with words after the slash. A built-in app's front door searches the app,
// whatever you have named it; a link on a well-known site searches or asks that site; any other
// link has no search this page knows of, so the web is searched for its site.
function reach(url, query) {
  if (!query) return url;
  const app = Object.values(BUILTIN).find((b) => b.own.test(url));
  if (app) return app.search.replace("%s", encodeURIComponent(query));
  const site = siteFor(url);
  return site ? filled(site.search, new URL(url).origin).replace("%s", encodeURIComponent(query)) : { search: `${query} site:${siteOf(url)}` };
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
  if (KNOWN[key]) return known(KNOWN[key], query);
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
