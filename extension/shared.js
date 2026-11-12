// Shared by the new tab page and the background worker: where spaces come from, and how a typed
// short link (mail/, cal/, claude/what-to-ask) resolves to an address.

// The short links that exist whatever is bookmarked. Each one with `search` also takes words.
export const BUILTIN = {
  mail: { url: "https://mail.google.com", search: "https://mail.google.com/mail/u/0/#search/%s", label: "Gmail", example: "mail/invoice searches your mail" },
  cal: { url: "https://calendar.google.com", label: "Google Calendar" },
  drive: { url: "https://drive.google.com", search: "https://drive.google.com/drive/search?q=%s", label: "Google Drive", example: "drive/contract searches Drive" },
  keep: { url: "https://keep.google.com", search: "https://keep.google.com/#search/text=%s", label: "Google Keep, for notes", example: "keep/idea searches your notes" },
  g: { url: "https://www.google.com", search: "https://www.google.com/search?q=%s", label: "Google search", example: "g/best-pizza searches Google" },
  claude: { url: "https://claude.ai/new", search: "https://claude.ai/new?q=%s", label: "Ask Claude", example: "claude/draft a reply to this, or type claude, press Tab, then the question" },
};

export const NEXT_TITLE = "⏭️ Next";

export function slug(text) {
  return (text || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
}

export function firstWord(text) {
  const w = (text || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/)[0];
  return w || "";
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

// Every bookmark's short links: its own alias if set, its first word when no other bookmark
// shares it ("admin" for "Admin console"), and its whole name squashed ("adminconsole").
export async function aliasTable() {
  const links = (await barChildren()).flatMap((n) => (n.url ? [n] : leaves(n)));
  const custom = await customAliases();
  const table = new Map();
  const firstCount = new Map();
  for (const l of links) { const f = firstWord(l.title); firstCount.set(f, (firstCount.get(f) || 0) + 1); }
  for (const l of links) {
    const own = custom[l.url];
    if (own && !table.has(own)) table.set(own, l.url);
  }
  for (const l of links) {
    const f = firstWord(l.title);
    if (f && firstCount.get(f) === 1 && !table.has(f)) table.set(f, l.url);
  }
  for (const l of links) {
    const s = slug(l.title);
    if (s && !table.has(s)) table.set(s, l.url);
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

// Where a typed short link goes, or null if it isn't one. `plain` words came from a search, where
// only a whole name counts: a search for "and/or" must not open the one bookmark starting "and".
export async function resolve(name, rest, plain = false) {
  const key = name.toLowerCase();
  const query = wordsOf(rest, plain);
  const own = (await customLinks())[key];
  if (own) return own.replace("%s", encodeURIComponent(query));
  const table = await aliasTable();
  const custom = await customAliases();
  if (Object.values(custom).includes(key) && table.has(key)) return table.get(key);
  const b = BUILTIN[key];
  if (b) return query && b.search ? b.search.replace("%s", encodeURIComponent(query)) : b.url;
  if (table.has(key)) return table.get(key);
  if (plain) return null;
  const hits = [...table.keys()].filter((a) => a.startsWith(key));
  const urls = new Set(hits.map((a) => table.get(a)));
  return urls.size === 1 ? [...urls][0] : null;
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
