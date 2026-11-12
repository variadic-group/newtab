// The Shortcuts page: every short link the address bar understands, and where each one goes.
import { el } from "./dom.js";
import { siteIcon, host } from "./icons.js";
import { BUILTIN, barChildren, leaves, aliasTable, aliasFor, claims, customAliases, customLinks, slug } from "./shared.js";

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
  if (note) r.append(el("div", "sc-note", note));
  return r;
}

// A bookmark that carries a built-in name also carries that name's note on searching.
function linkRow(link, table, done) {
  const what = el("a", "sc-what");
  what.href = link.url;
  what.append(siteIcon(link.url, link.title), el("span", "t", link.title || host(link.url)), el("span", "h", host(link.url)));
  const builtin = BUILTIN[aliasFor(link, table)];
  return row(aliasPill(link, table, done), what, builtin && builtin.example);
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
  const chromes = el("button", "mini", "Chrome's own search shortcuts ↗");
  chromes.type = "button";
  chromes.dataset.go = "chrome://settings/searchEngines";
  chromes.title = "Chrome keeps its own list, which an extension can't read or change";
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

export async function renderShortcuts(root, done) {
  const table = await aliasTable();
  const cards = [];

  // A built-in name that one of your bookmarks carries is listed once, with that bookmark.
  const carried = await claims();
  const built = el("article", "sc-card");
  built.append(el("h2", null, "Always there"));
  for (const [name, b] of Object.entries(BUILTIN)) {
    if (carried.has(name) && table.get(name) === carried.get(name)) continue;
    const what = el("a", "sc-what");
    what.href = b.url;
    what.append(siteIcon(b.url, b.label), el("span", "t", b.label));
    built.append(row(el("code", "key fixed", `${name}/`), what, b.example));
  }
  cards.push(built, await ownCard(done));

  for (const space of (await barChildren()).filter((k) => !k.url)) {
    const card = el("article", "sc-card");
    card.append(el("h2", null, space.title));
    const kids = space.children || [];
    for (const l of kids.filter((k) => k.url)) card.append(linkRow(l, table, done));
    for (const sub of kids.filter((k) => !k.url)) {
      const links = leaves(sub);
      if (!links.length) continue;
      card.append(el("h3", null, sub.title));
      for (const l of links) card.append(linkRow(l, table, done));
    }
    cards.push(card);
  }
  root.replaceChildren(...cards);
}
