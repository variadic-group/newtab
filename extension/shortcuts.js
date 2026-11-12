// The Shortcuts page: every short link the address bar understands, and where each one goes.
import { el } from "./dom.js";
import { siteIcon, host } from "./icons.js";
import { BUILTIN, CHROME_PAGES, barChildren, leaves, aliasTable, aliasFor, claims, customAliases, customLinks, slug, resolve } from "./shared.js";

// ---------- try one ----------
// The box at the top of the page is the address bar's stand-in: type a short link and it says
// where that would go, in words; Enter goes there. It asks the same code the address bar does.
async function explain(typed) {
  const m = /^([^\s/]+)\/?(.*)$/.exec(typed.trim());
  if (!m) return null;
  const [, name, rest] = m;
  const words = rest.trim();
  const target = await resolve(name, rest);
  if (!target) return { say: `No short name starts with “${name}”.` };
  if (typeof target !== "string") return { target, say: `Searches the web for “${words}” on ${target.search.split(" site:").pop()}.` };
  const page = Object.values(CHROME_PAGES).find((c) => target.startsWith(c.url));
  if (page) return { target, say: words && page.search ? `Searches Chrome's ${page.label.toLowerCase()} for “${words}”.` : `Opens Chrome's ${page.label.toLowerCase()}.` };
  const app = Object.values(BUILTIN).find((b) => b.own.test(target) || target.startsWith(b.search.split("%s")[0]));
  if (app) return { target, say: words ? `Searches ${app.label} for “${words}”.` : `Opens ${app.label}.` };
  const mine = (await barChildren()).flatMap((n) => (n.url ? [n] : leaves(n))).find((l) => l.url === target);
  return { target, say: words ? `Opens ${host(target)} with “${words}”.` : `Opens ${mine ? mine.title : host(target)}.` };
}

let wired = false;
export function wireTry() {
  if (wired) return;
  wired = true;
  const bar = document.getElementById("tryBar"), out = document.getElementById("tryOut");
  let found = null;
  const read = async () => {
    const typed = bar.value;
    found = typed.trim() ? await explain(typed) : null;
    if (typed !== bar.value) return; // more was typed while this was worked out
    out.textContent = found ? found.say : "";
    out.classList.toggle("go", !!(found && found.target));
  };
  bar.oninput = read;
  bar.onkeydown = (e) => {
    if (e.key !== "Enter" || !found || !found.target) return;
    if (typeof found.target === "string") chrome.tabs.update({ url: found.target });
    else chrome.search.query({ text: found.target.search, disposition: "CURRENT_TAB" });
  };
}
// An example on the page is a button: pressing it types the example into the box.
function example(text) {
  const b = el("button", "sc-note eg", text);
  b.type = "button";
  b.title = "Try it in the box at the top";
  b.onclick = () => { const bar = document.getElementById("tryBar"); bar.value = text; bar.focus(); bar.oninput(); bar.scrollIntoView({ block: "nearest" }); };
  return b;
}

// Turns a link's short name into a text box; an empty name goes back to the automatic one.
export function editAlias(pill, link, done) {
  const input = el("input", "alias-input");
  input.value = pill.dataset.alias || "";
  input.setAttribute("aria-label", `Short name for ${link.title}`);
  pill.replaceWith(input);
  input.focus();
  input.select();
  const finish = async (save) => {
    input.onblur = null;
    if (save) {
      const aliases = await customAliases();
      const v = slug(input.value);
      if (v) aliases[link.url] = v; else delete aliases[link.url];
      await chrome.storage.sync.set({ aliases });
    }
    done();
  };
  input.onkeydown = (e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); };
  input.onblur = () => finish(true);
}

export function aliasPill(link, table, done) {
  const alias = aliasFor(link, table);
  const pill = el("button", "key", alias ? `${alias}/` : "set a name");
  pill.type = "button";
  pill.dataset.alias = alias;
  pill.title = "Click to change";
  pill.onclick = (e) => { e.preventDefault(); e.stopPropagation(); editAlias(pill, link, done); };
  return pill;
}

function row(key, what, note) {
  const r = el("div", "sc-row");
  r.append(key, what);
  if (note) r.append(example(note));
  return r;
}

function linkRow(link, table, done) {
  const what = el("a", "sc-what");
  what.href = link.url;
  what.append(siteIcon(link.url, link.title), el("span", "t", link.title || host(link.url)), el("span", "h", host(link.url)));
  return row(aliasPill(link, table, done), what);
}

// Shortcuts worth a click to add. Each address is the site's own search or ask page.
const SUGGEST = {
  gpt: ["ChatGPT", "https://chatgpt.com/?q=%s"],
  pplx: ["Perplexity", "https://www.perplexity.ai/search?q=%s"],
  yt: ["YouTube", "https://www.youtube.com/results?search_query=%s"],
  gh: ["GitHub", "https://github.com/search?q=%s"],
  maps: ["Google Maps", "https://www.google.com/maps/search/%s"],
  wiki: ["Wikipedia", "https://en.wikipedia.org/w/index.php?search=%s"],
};

// Your own shortcuts: any name to any address, the way Chrome's site search works.
async function ownCard(done) {
  const links = await customLinks();
  const card = el("article", "sc-card");
  card.append(el("h2", null, "Your own"));
  for (const [name, url] of Object.entries(links).sort()) {
    const what = el("span", "sc-what");
    what.append(siteIcon(url, name), el("span", "t", url.replace(/^https?:\/\//, "")));
    const x = el("button", "mini danger", "Remove");
    x.type = "button";
    x.setAttribute("aria-label", `Remove ${name}/`);
    x.onclick = async () => { const all = await customLinks(); delete all[name]; await chrome.storage.sync.set({ links: all }); done(); };
    what.append(x);
    card.append(row(el("code", "key fixed", `${name}/`), what));
  }
  const form = el("form", "sc-add");
  const name = el("input"); name.placeholder = "name"; name.required = true; name.setAttribute("aria-label", "Shortcut name");
  const url = el("input"); url.placeholder = "address (%s = typed words)"; url.required = true; url.setAttribute("aria-label", "Address");
  const add = el("button", "btn", "Add"); add.type = "submit";
  form.append(name, url, add);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const key = slug(name.value);
    let u = url.value.trim();
    if (u && !/^[a-z]+:\/\//i.test(u)) u = "https://" + u;
    try { new URL(u.replace("%s", "x")); } catch { url.setCustomValidity("Paste a full web address."); url.reportValidity(); return; }
    if (!key) return;
    const all = await customLinks();
    all[key] = u;
    await chrome.storage.sync.set({ links: all });
    done();
  };
  card.append(form, el("p", "sc-note solo", "Example: name hn, address https://hn.algolia.com/?q=%s, then hn/rust searches it."));
  const chromes = el("button", "mini", "Search engines in Chrome");
  chromes.type = "button";
  chromes.dataset.go = "chrome://settings/searchEngines";
  chromes.title = "Chrome keeps its own list of search shortcuts, which an extension can't read or change";
  const more = Object.entries(SUGGEST).filter(([key]) => !links[key]);
  if (more.length) {
    const row = el("div", "sc-suggest");
    row.append(el("span", "cap", "Add one:"));
    for (const [key, [label, address]] of more) {
      const b = el("button", "chip", `${key}/ ${label}`);
      b.type = "button";
      b.title = address;
      b.onclick = async () => { const all = await customLinks(); all[key] = address; await chrome.storage.sync.set({ links: all }); done(); };
      row.append(b);
    }
    card.append(row);
  }
  card.append(chromes);
  return card;
}

// Chrome's own pages, by name. A bookmark that already goes by one of these keeps it.
async function chromeCard(table) {
  const card = el("article", "sc-card");
  card.append(el("h2", null, "Chrome's own pages"), el("p", "sc-note lead", "Chrome's pages have names too, and words after one search inside it. A bookmark with the same name wins."));
  for (const [name, page] of Object.entries(CHROME_PAGES)) {
    if (table.has(name)) continue;
    const what = el("button", "sc-what");
    what.type = "button";
    what.dataset.go = page.url;
    what.append(el("span", "t", page.label), el("span", "h", "in Chrome"));
    card.append(row(el("code", "key page", `${name}/`), what, page.example));
  }
  // The key that saves a page to Up next is Chrome's to change.
  const [save] = (await chrome.commands.getAll()).filter((c) => c.name === "_execute_action");
  const keys = el("button", "mini", "Keyboard shortcuts in Chrome");
  keys.type = "button";
  keys.dataset.go = "chrome://extensions/shortcuts";
  card.append(el("p", "sc-note solo", save && save.shortcut ? `${save.shortcut} adds the page you are on to Up next.` : "No key is set for adding the page you are on to Up next."), keys);
  return card;
}

export async function renderShortcuts(root, done) {
  wireTry();
  const table = await aliasTable();
  const cards = [];

  // Every built-in is listed here whether or not you have bookmarked it. One that a bookmark of
  // yours carries opens that bookmark, which is then listed here and not again under its space:
  // each name is on this page once.
  const carried = await claims();
  const built = el("article", "sc-card");
  built.append(el("h2", null, "Always there"), el("p", "sc-note lead", "Google's apps and Claude, bookmarked or not. Words after the slash search inside the app."));
  for (const [name, b] of Object.entries(BUILTIN)) {
    const what = el("a", "sc-what");
    what.href = carried.get(name) || b.url;
    what.append(siteIcon(b.url, b.label), el("span", "t", b.label));
    if (carried.has(name)) what.append(el("span", "h", "your bookmark"));
    built.append(row(el("code", "key fixed", `${name}/`), what, b.example));
  }
  cards.push(built, await chromeCard(table), await ownCard(done));
  const listed = (l) => { const name = aliasFor(l, table); return !(BUILTIN[name] && carried.get(name) === l.url); };

  for (const space of (await barChildren()).filter((k) => !k.url)) {
    const card = el("article", "sc-card");
    card.append(el("h2", null, space.title));
    const kids = space.children || [];
    for (const l of kids.filter((k) => k.url && listed(k))) card.append(linkRow(l, table, done));
    for (const sub of kids.filter((k) => !k.url)) {
      const links = leaves(sub).filter(listed);
      if (!links.length) continue;
      card.append(el("h3", null, sub.title));
      for (const l of links) card.append(linkRow(l, table, done));
    }
    if (card.children.length > 1) cards.push(card);
  }
  root.replaceChildren(...cards);
}
