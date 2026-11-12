// Find: the box in the top bar. Type part of a name, a site or a short name and the page is
// replaced, while there is something typed, by a list of every link you keep that matches,
// whichever space it is in, and the tabs open in this window. Best match first; Enter opens
// the first. With no match, Enter hands the words to your search engine.
import { $, el } from "./dom.js";
import { siteIcon, tabIcon, host } from "./icons.js";
import { barChildren, aliasTable, aliasFor, nextFolder } from "./shared.js";

const SHOWN = 20;
let all = [];

async function everything() {
  const table = await aliasTable();
  const out = [];
  const walk = (node, trail) => {
    for (const k of node.children || []) {
      if (k.url) out.push({ title: k.title || host(k.url), url: k.url, where: trail.join(" › ") || "Bookmarks bar", alias: aliasFor(k, table) });
      else walk(k, [...trail, k.title || "Untitled"]);
    }
  };
  walk({ children: await barChildren() }, []);
  const next = await nextFolder();
  for (const k of (next && next.children) || []) if (k.url) out.push({ title: k.title || host(k.url), url: k.url, where: "Up next", alias: "" });
  const me = await chrome.tabs.getCurrent();
  for (const t of await chrome.tabs.query({ currentWindow: true })) {
    if (/^https?:/.test(t.url || "") && (!me || t.id !== me.id)) out.push({ title: t.title || t.url, url: t.url, where: "Open tab", alias: "", tab: t });
  }
  return out;
}

// Every word typed has to be somewhere in the link: its name counts most, then its short name,
// its site, and last the folders it is in.
function score(item, words) {
  const title = item.title.toLowerCase(), site = host(item.url), place = item.where.toLowerCase();
  const starts = title.split(/[\s\-_/.,:()]+/);
  let total = 0;
  for (const q of words) {
    const s = item.alias === q ? 100 : title.startsWith(q) ? 80 : item.alias.startsWith(q) ? 70 : starts.some((w) => w.startsWith(q)) ? 60 : title.includes(q) ? 40 : site.includes(q) ? 30 : place.includes(q) ? 10 : 0;
    if (!s) return 0;
    total += s;
  }
  return total;
}

const go = (item) => (item.tab ? chrome.tabs.update(item.tab.id, { active: true }) : chrome.tabs.update({ url: item.url }));

function draw() {
  const typed = $("findBox").value.trim();
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  // While something is typed the list stands in for the page; cleared, the page is back.
  document.body.classList.toggle("finding", words.length > 0);
  $("find").hidden = !words.length;
  const hits = words.length ? all.map((item) => ({ item, s: score(item, words) })).filter((h) => h.s).sort((a, b) => b.s - a.s || a.item.title.localeCompare(b.item.title)).map((h) => h.item) : [];
  $("findList").replaceChildren(...hits.slice(0, SHOWN).map((item) => {
    const a = el("a", "find-row");
    a.href = item.url;
    a.onclick = (e) => { e.preventDefault(); go(item); };
    a.append(item.tab ? tabIcon(item.tab) : siteIcon(item.url, item.title), el("span", "t", item.title), el("span", "h", item.where));
    if (item.alias) a.append(el("code", "key fixed", `${item.alias}/`));
    const li = el("li");
    li.append(a);
    return li;
  }));
  $("findSay").textContent = !words.length ? "" : !hits.length ? `Nothing you keep matches “${typed}”. Enter searches the web for it.`
    : hits.length > SHOWN ? `${hits.length - SHOWN} more match. Keep typing to narrow it.` : "Enter opens the first.";
  return hits;
}

export function clearFind() {
  if (!$("findBox").value) return;
  $("findBox").value = "";
  draw();
}

export function wireFind() {
  const box = $("findBox");
  // What can be found is read when the box is entered, so it is as the bookmarks are now.
  box.onfocus = async () => { all = await everything(); draw(); };
  box.oninput = draw;
  box.onkeydown = (e) => {
    if (e.key === "Escape") { clearFind(); box.blur(); }
    if (e.key === "ArrowDown") { e.preventDefault(); $("findList").querySelector("a")?.focus(); }
    if (e.key !== "Enter") return;
    const typed = box.value.trim();
    const [first] = draw();
    if (first) go(first); else if (typed) chrome.search.query({ text: typed, disposition: "CURRENT_TAB" });
  };
  // The arrow keys walk the list; up from the first goes back to the box.
  $("findList").onkeydown = (e) => {
    if (e.key === "Escape") { clearFind(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const li = document.activeElement.closest("li");
    const to = e.key === "ArrowDown" ? li.nextElementSibling : li.previousElementSibling;
    if (to) to.querySelector("a").focus(); else if (e.key === "ArrowUp") box.focus();
  };
  // A slash anywhere on the page that isn't being typed into goes to the box.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.target.closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    box.focus();
  });
}
