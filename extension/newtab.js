import { $, el } from "./dom.js";
import { loadIcons, siteIcon, tabIcon, host } from "./icons.js";
import { BUILTIN, claims, barChildren, bookmarkBars, leaves, aliasTable, aliasFor, nextFolder, addToNext } from "./shared.js";
import { renderShortcuts, aliasPill } from "./shortcuts.js";
import { renderToday, tickToday, tickTheme, renderGlance, warmWeather } from "./today.js";
import { placeForm, getPlace, leftBehind, keepPlace } from "./place.js";
import { renderExtras, renderMail, renderFiles, renderClosed, renderOften } from "./extras.js";
import { renderTools } from "./tools.js";

const TODAY = "today";
const KEYS = "shortcuts";
const TOOLS = "tools";
const isPage = (id) => id === TODAY || id === KEYS || id === TOOLS;
let current = null;
let pendingRename = null;

const editing = () => document.body.classList.contains("editing");
const label = (node) => node.title || host(node.url) || node.url;

// A line at the foot of the page that goes away by itself. `act` is what its one button does,
// or a list of { label, run } when there is more than one answer.
let toastTimer;
function toast(text, act, { label = "Undo", ms = 6000 } = {}) {
  const t = $("toast");
  t.replaceChildren(el("span", null, text));
  for (const a of typeof act === "function" ? [{ label, run: act }] : act || []) {
    const b = el("button", null, a.label);
    b.type = "button";
    b.onclick = () => { a.run(); t.hidden = true; };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- drag and drop ----------
// What is being dragged: a "link" tile, a "next" item, a "folder" (a card), a "space" tab or an
// open "tab". Dragging works all the time, not only in Edit.
let dragged = null;
const takes = (accepts) => dragged && accepts.includes(dragged.kind);

// `what` describes the thing dragged, or is a function that does when the drag starts.
function drags(node, what, mark = node) {
  node.draggable = true;
  node.addEventListener("dragstart", () => { dragged = { ...(typeof what === "function" ? what() : what), el: mark }; mark.classList.add("dragging"); });
}
document.addEventListener("dragend", () => {
  dragged = null;
  for (const n of document.querySelectorAll(".dragging, .drop, .before, .after")) n.classList.remove("dragging", "drop", "before", "after");
});

// A drop that lands inside the target: at the end of a folder or a list.
function dropTarget(node, accepts, onDrop) {
  node.addEventListener("dragover", (e) => {
    if (!takes(accepts)) return;
    e.preventDefault(); e.stopPropagation();
    node.parentElement.closest(".drop")?.classList.remove("drop");
    node.classList.add("drop");
  });
  node.addEventListener("dragleave", (e) => { if (!node.contains(e.relatedTarget)) node.classList.remove("drop"); });
  node.addEventListener("drop", (e) => {
    if (!takes(accepts)) return;
    e.preventDefault(); e.stopPropagation();
    const d = dragged;
    dragged = null;
    onDrop(d);
  });
}

// A drop that lands before or after the target, on the side of it the pointer is over.
function orderTarget(node, accepts, axis, onDrop) {
  const isBefore = (e) => {
    const r = node.getBoundingClientRect();
    return axis === "x" ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
  };
  node.addEventListener("dragover", (e) => {
    if (!takes(accepts)) return;
    e.preventDefault(); e.stopPropagation();
    node.parentElement.closest(".drop")?.classList.remove("drop");
    if (dragged.el === node) return;
    const before = isBefore(e);
    node.classList.toggle("before", before);
    node.classList.toggle("after", !before);
  });
  node.addEventListener("dragleave", (e) => { if (!node.contains(e.relatedTarget)) node.classList.remove("before", "after"); });
  node.addEventListener("drop", (e) => {
    if (!takes(accepts)) return;
    e.preventDefault(); e.stopPropagation();
    const d = dragged;
    dragged = null;
    if (d.el !== node) onDrop(d, isBefore(e));
  });
}

// bookmarks.move counts the index before the item leaves its old place, so "before T" is T's
// own index and "after T" is one more, whichever folder the item comes from.
const slot = (target, before) => ({ parentId: target.parentId, index: before ? target.index : target.index + 1 });

// Puts what was dragged at a place in the bookmarks: a bookmark moves, an open tab is saved.
function place(d, where) {
  if (d.kind === "tab") return chrome.bookmarks.create({ ...where, title: d.tab.title || d.tab.url, url: d.tab.url });
  if (d.id !== where.parentId) return chrome.bookmarks.move(d.id, where);
}

// ---------- spaces ----------
async function spaces() {
  const kids = await barChildren();
  const list = kids.filter((k) => !k.url).map((f) => ({ id: f.id, title: f.title || "Untitled", node: f }));
  const loose = kids.filter((k) => k.url);
  if (loose.length) list.unshift({ id: "pinned", title: "📌 Pinned", node: { id: kids[0].parentId, children: loose }, pinned: true });
  return list;
}

async function render() {
  const all = await spaces();
  const { space: saved } = await chrome.storage.local.get("space");
  if (!current) current = saved || (all[0] && all[0].id) || TODAY;
  if (!isPage(current) && !all.some((s) => s.id === current)) current = all[0] ? all[0].id : TODAY;

  $("spaces").replaceChildren(...all.map((s) => tabFor(s.id, s.title, s)), newSpaceTab(!all.length));
  renameNew($("spaces"));
  fitSpaces();
  $("pages").replaceChildren(tabFor(TODAY, "☀️ Today"), tabFor(KEYS, "⌨️ Shortcuts"), tabFor(TOOLS, "🛠️ Tools"));
  $("today").hidden = current !== TODAY;
  $("shortcuts").hidden = current !== KEYS;
  $("tools").hidden = current !== TOOLS;
  $("space").hidden = isPage(current);
  $("edit").hidden = isPage(current);
  $("empty").hidden = all.length > 0;
  if (current === TODAY) return renderToday();
  if (current === KEYS) return renderShortcuts($("scBody"), render);
  if (current === TOOLS) return renderTools($("toolsBody"));
  // The time and date open your calendar: your own Calendar bookmark if you keep one.
  $("glCal").href = (await claims()).get("cal") || BUILTIN.cal.url;
  const space = all.find((s) => s.id === current);
  if (space) await renderSpace(space);
  await Promise.all([renderGlance(), renderNext(), renderTabs(), renderMail(), renderFiles(), renderClosed(), renderOften()]);
}

function show(id) {
  current = id;
  // Editing belongs to a space; leaving for Today or Shortcuts ends it.
  if (isPage(id) && editing()) $("edit").click();
  // A new tab reopens on the last space, never on Today or Shortcuts.
  if (!isPage(id)) chrome.storage.local.set({ space: id });
  render();
}

// A folder made on this page is named straight away: its heading opens as a text box.
function renameNew(scope) {
  if (!pendingRename) return;
  const h = scope.querySelector(`[data-id="${pendingRename}"]`);
  if (!h) return;
  pendingRename = null;
  startRename(h);
}

// A tab's name with its leading emoji apart, so a narrow bar can keep the emoji and drop the word.
const EMOJI = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})[\uFE0F\u200D\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}]*)\s+(.+)$/u;
function tabFor(id, title, space) {
  const b = el("button", "tab");
  const m = EMOJI.exec(title);
  if (m) b.append(el("span", "e", m[1]), el("span", "l", ` ${m[2]}`)); else b.textContent = title;
  b.title = title;
  b.type = "button";
  b.setAttribute("role", "tab");
  b.setAttribute("aria-selected", String(id === current));
  b.onclick = () => show(id);
  if (space && !space.pinned) {
    // In Edit, a click on the space you are in renames it.
    b.dataset.id = space.id;
    b.dataset.name = space.node.title;
    b.onclick = () => (editing() && id === current ? startRename(b) : show(id));
    dropTarget(b, ["link", "next", "folder", "tab"], (d) => place(d, { parentId: space.id }));
    drags(b, { kind: "space", id: space.id });
    orderTarget(b, ["space"], "x", (d, before) => place(d, slot(space.node, before)));
  }
  return b;
}

// The bar is one row whatever is on it. Space tabs narrow to fit, down to their emoji; past that
// the strip scrolls sideways, its ends fade where more is hidden, and the tab you are in is
// brought into view. Today, Shortcuts, Tools and the pencil never move.
const strip = $("spaces");
function fades() {
  const more = strip.scrollWidth - strip.clientWidth;
  strip.classList.toggle("more-left", more > 1 && strip.scrollLeft > 1);
  strip.classList.toggle("more-right", more > 1 && strip.scrollLeft < more - 1);
}
function fitSpaces() {
  // A tab cut down to little more than its emoji shows the emoji alone, not half a word.
  const tabs = [...strip.querySelectorAll(".tab[data-id]")];
  for (const t of tabs) t.classList.remove("tight");
  const cut = tabs.filter((t) => t.querySelector(".e") && t.clientWidth < 84 && t.scrollWidth > t.clientWidth + 1);
  for (const t of cut) t.classList.add("tight");
  const on = strip.querySelector('[aria-selected="true"]');
  if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
  fades();
}
strip.addEventListener("scroll", fades, { passive: true });
// Its room changes with the window, and when Edit adds to the right of the bar.
new ResizeObserver(fitSpaces).observe(strip);
// A mouse wheel turns the strip, and something dragged to either end of it does too, so a link
// can still be dropped on a space that is out of sight.
strip.addEventListener("wheel", (e) => {
  if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
  e.preventDefault();
  strip.scrollLeft += e.deltaY;
}, { passive: false });
strip.addEventListener("dragover", (e) => {
  const r = strip.getBoundingClientRect();
  if (e.clientX < r.left + 36) strip.scrollLeft -= 14; else if (e.clientX > r.right - 36) strip.scrollLeft += 14;
});

// In Edit, a "+" after the spaces makes a new one: a folder on the bookmarks bar. With no space
// yet it is the way in, so it shows without Edit, says what it is, and leaves Edit on.
function newSpaceTab(first) {
  const b = el("button", first ? "tab add-space" : "tab add-space edit-only", first ? "+ New space" : "+");
  b.type = "button";
  b.title = "New space";
  b.setAttribute("aria-label", "New space");
  b.onclick = async () => {
    const [root] = await chrome.bookmarks.getTree();
    const f = await chrome.bookmarks.create({ parentId: bookmarkBars(root)[0].id, title: "New space" });
    pendingRename = f.id;
    current = f.id;
    chrome.storage.local.set({ space: f.id });
    if (!editing()) $("edit").click();
  };
  return b;
}

async function renderSpace(space) {
  const table = await aliasTable();
  const kids = space.node.children || [];
  const cards = [];
  const direct = kids.filter((k) => k.url);
  if (direct.length || kids.every((k) => k.url)) cards.push(cardFor({ id: space.node.id, title: space.pinned ? "Bookmarks bar" : "Links", children: direct }, table, true));
  for (const sub of kids.filter((k) => !k.url)) cards.push(cardFor(sub, table, false));
  const add = el("button", "card new-card edit-only");
  add.type = "button";
  add.append(plusIcon(), el("span", "name", "New collection"));
  add.onclick = async () => {
    const f = await chrome.bookmarks.create({ parentId: space.node.id, title: "New collection" });
    pendingRename = f.id;
  };
  $("collections").replaceChildren(...cards, add);
  // Like a collection, a space can be deleted here once it is empty; the bookmark manager
  // removes a full one.
  if (!space.pinned && !kids.length) {
    cards[0].append(el("p", "note view-only", "Nothing here yet. The pencil at the top right adds collections and links; an open tab can be dragged in from the list on the right."));
    const del = el("button", "mini danger edit-only", "Delete this empty space");
    del.type = "button";
    del.onclick = async () => {
      const { parentId, index, title } = space.node;
      await chrome.bookmarks.remove(space.id);
      toast(`Deleted ${space.title}`, () => chrome.bookmarks.create({ parentId, index, title }));
    };
    $("collections").append(del);
  }
  $("saveTabs").onclick = () => saveTabs(space);
  $("saveTabs").hidden = !!space.pinned;
  renameNew($("collections"));
}

function plusIcon() {
  const plus = el("span", "sico plus");
  plus.append(el("span", null, "+"));
  return plus;
}

async function openAsGroup(title, links) {
  const ids = [];
  for (const l of links) ids.push((await chrome.tabs.create({ url: l.url, active: false })).id);
  if (ids.length < 2) return;
  const groupId = await chrome.tabs.group({ tabIds: ids });
  await chrome.tabGroups.update(groupId, { title });
}

// A folder inside a collection is a headed group in its card; one inside that reads "A › B".
// A folder that only holds other folders gets no heading of its own.
function groupsIn(folder, trail = []) {
  const out = [];
  for (const sub of (folder.children || []).filter((k) => !k.url)) {
    const path = [...trail, sub.title || "Untitled"];
    const links = (sub.children || []).filter((k) => k.url);
    const inner = groupsIn(sub, path);
    if (links.length || !inner.length) out.push({ folder: sub, title: path.join(" › "), links });
    out.push(...inner);
  }
  return out;
}

function deleteButton(folder) {
  const del = el("button", "mini danger edit-only", "Delete");
  del.type = "button";
  del.onclick = () => chrome.bookmarks.remove(folder.id);
  return del;
}

function tilesOf(links, table) {
  const grid = el("div", "tiles");
  for (const l of links) grid.append(tileFor(l, table));
  return grid;
}

function cardFor(folder, table, isRoot) {
  const own = (folder.children || []).filter((k) => k.url);
  const groups = isRoot ? [] : groupsIn(folder);
  const all = isRoot ? own : leaves(folder);
  const card = el("article", "card");
  card.dataset.folder = folder.id;
  const head = el("div", "card-head");
  const h = el("h2", null, folder.title);
  h.dataset.id = folder.id;
  const act = el("div", "act");
  if (all.length) {
    const open = el("button", "mini", "Open all");
    open.type = "button";
    open.title = "Opens these as one tab group";
    open.onclick = () => openAsGroup(folder.title, all);
    act.append(open);
  }
  if (!isRoot) {
    h.onclick = () => { if (editing()) startRename(h); };
    // A group is a folder inside the collection: a headed row of tiles in this card.
    const group = el("button", "mini edit-only", "Add group");
    group.type = "button";
    group.title = "A headed group of links inside this collection";
    group.onclick = async () => {
      const f = await chrome.bookmarks.create({ parentId: folder.id, title: "New group" });
      pendingRename = f.id;
    };
    act.append(group);
    if (!(folder.children || []).length) act.append(deleteButton(folder));
    drags(head, { kind: "folder", id: folder.id }, card);
    orderTarget(card, ["folder"], "y", (d, before) => place(d, slot(folder, before)));
  }
  head.append(h, act);
  const grid = tilesOf(own, table);
  const add = el("button", "tile add edit-only");
  add.type = "button";
  add.append(plusIcon(), el("span", "name", "Add link"));
  add.onclick = () => openAddForm(card, folder.id);
  grid.append(add);
  card.append(head, grid, ...groups.map((g) => groupFor(g, table)));
  dropTarget(card, ["link", "next", "tab"], (d) => place(d, { parentId: folder.id }));
  return card;
}

function groupFor(g, table) {
  const sec = el("section", "group");
  sec.dataset.folder = g.folder.id;
  const head = el("div", "group-head");
  const h = el("h3", null, g.title);
  h.dataset.id = g.folder.id;
  h.dataset.name = g.folder.title;
  h.onclick = () => { if (editing()) startRename(h); };
  head.append(h);
  if (!g.links.length) head.append(deleteButton(g.folder));
  sec.append(head, g.links.length ? tilesOf(g.links, table) : el("p", "note", "Empty. Drag a link here."));
  dropTarget(sec, ["link", "next", "tab"], (d) => place(d, { parentId: g.folder.id }));
  return sec;
}

function tileFor(link, table) {
  const a = el("a", "tile");
  a.href = link.url;
  const alias = aliasFor(link, table);
  a.title = alias ? `${host(link.url)}, or type ${alias}/` : host(link.url);
  const name = el("span", "name", label(link));
  name.dataset.id = link.id;
  // In Edit, a click on the name renames the bookmark. The tile stops being draggable meanwhile,
  // or the mouse couldn't select text in the box.
  name.onclick = (e) => {
    if (!editing()) return;
    e.preventDefault();
    a.draggable = false;
    startRename(name, () => { a.draggable = true; });
  };
  a.append(siteIcon(link.url, link.title), name, aliasPill(link, table, render));
  const x = el("button", "x", "×");
  x.type = "button";
  x.setAttribute("aria-label", "Remove " + label(link));
  x.onclick = async (e) => {
    e.preventDefault(); e.stopPropagation();
    const { parentId, index, title, url } = link;
    await chrome.bookmarks.remove(link.id);
    toast(`Removed ${label(link)}`, () => chrome.bookmarks.create({ parentId, index, title, url }));
  };
  a.append(x);
  drags(a, { kind: "link", id: link.id });
  orderTarget(a, ["link", "next", "tab"], "x", (d, before) => place(d, slot(link, before)));
  a.addEventListener("click", (e) => { if (editing()) e.preventDefault(); });
  return a;
}

// Turns a card's title, a group's heading or a tile's name into a text box. A group's heading
// shows its whole path; only its own name is edited. `cancelled` runs if nothing was changed.
function startRename(h, cancelled) {
  const was = h.dataset.name ?? h.textContent;
  const input = el("input", "rename");
  input.value = was;
  input.setAttribute("aria-label", "Name");
  h.replaceWith(input);
  input.focus(); input.select();
  const done = async (save) => {
    input.onblur = null;
    const v = input.value.trim();
    if (save && v && v !== was) { input.blur(); await chrome.bookmarks.update(h.dataset.id, { title: v }); }
    else { input.replaceWith(h); if (cancelled) cancelled(); }
  };
  input.onkeydown = (e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); };
  input.onblur = () => done(true);
}

function openAddForm(card, parentId) {
  card.querySelector(".addform")?.remove();
  const form = el("form", "addform");
  const name = el("input"); name.placeholder = "Name"; name.required = true;
  const url = el("input"); url.placeholder = "https://…"; url.required = true; url.inputMode = "url";
  const btns = el("div", "row-btns");
  const save = el("button", "btn", "Add"); save.type = "submit";
  const cancel = el("button", "btn", "Cancel"); cancel.type = "button"; cancel.onclick = () => form.remove();
  btns.append(save, cancel);
  form.append(name, url, btns);
  form.onsubmit = async (e) => {
    e.preventDefault();
    let u = url.value.trim();
    if (u && !/^[a-z]+:\/\//i.test(u)) u = "https://" + u;
    try { new URL(u); } catch { url.setCustomValidity("Paste a full web address."); url.reportValidity(); return; }
    form.remove();
    await chrome.bookmarks.create({ parentId, title: name.value.trim(), url: u });
  };
  card.querySelector(".tiles").after(form);
  name.focus();
}

// ---------- the side: Up next, Open tabs, Notes ----------
function rowLink(url, title, icon) {
  const a = el("a", "row");
  a.href = url;
  a.title = url;
  a.append(icon, el("span", "t", title), el("span", "h", host(url)));
  return a;
}

async function renderNext() {
  const folder = await nextFolder();
  const items = folder ? (folder.children || []).filter((c) => c.url) : [];
  $("nextCount").textContent = items.length ? String(items.length) : "";
  $("nextEmpty").hidden = items.length > 0;
  $("next").replaceChildren(...items.map(nextItem));
}

function nextItem(link) {
  const li = el("li");
  const done = el("button", "check");
  done.type = "button";
  done.title = "Done";
  done.setAttribute("aria-label", "Done: " + label(link));
  done.onclick = async () => {
    const { parentId, index, title, url } = link;
    await chrome.bookmarks.remove(link.id);
    toast(`Done: ${label(link)}`, () => chrome.bookmarks.create({ parentId, index, title, url }));
  };
  li.append(done, rowLink(link.url, label(link), siteIcon(link.url, link.title)));
  drags(li, { kind: "next", id: link.id });
  orderTarget(li, ["next", "tab"], "y", (d, before) => (d.kind === "tab" ? addToNext(d.tab, slot(link, before).index) : place(d, slot(link, before))));
  return li;
}

async function otherTabs() {
  const me = await chrome.tabs.getCurrent();
  return (await chrome.tabs.query({ currentWindow: true })).filter((t) => /^https?:/.test(t.url || "") && (!me || t.id !== me.id));
}

// Open tabs change all the time: a title, an icon, a page loading somewhere. Each change asks
// for a redraw, and a row that was rebuilt between pressing its button and letting go never got
// the click. So a tab keeps its row for as long as it is open, and the row is updated in place.
const tabRows = new Map();

function tabRow(first) {
  const row = { tab: first, li: el("li") };
  const a = el("a", "row");
  const icon = el("span", "slot"), title = el("span", "t"), where = el("span", "h");
  a.append(icon, title, where);
  const shut = async () => {
    const { id, url, index, title: name } = row.tab;
    await chrome.tabs.remove(id);
    toast(`Closed ${name || url}`, () => chrome.tabs.create({ url, index, active: false }));
  };
  a.onclick = (e) => { e.preventDefault(); chrome.tabs.update(row.tab.id, { active: true }); };
  // A middle click closes it, as it does on the tab strip.
  a.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); shut(); } };
  const add = el("button", "mini", "Up next");
  add.type = "button";
  add.title = "Keep this page under Up next";
  add.onclick = async () => toast((await addToNext(row.tab)) ? "Added to Up next." : "Already in Up next.");
  const close = el("button", "mini close", "×");
  close.type = "button";
  close.title = "Close this tab";
  close.onclick = shut;
  row.li.append(a, add, close);
  drags(row.li, () => ({ kind: "tab", tab: { id: row.tab.id, index: row.tab.index, title: row.tab.title, url: row.tab.url } }));
  // tabs.move counts the index after the tab has left its old place, unlike bookmarks.move.
  orderTarget(row.li, ["tab"], "y", (d, before) => {
    const to = before ? row.tab.index : row.tab.index + 1;
    return chrome.tabs.move(d.tab.id, { index: d.tab.index < to ? to - 1 : to });
  });
  let drawn = null;
  row.update = (tab) => {
    row.tab = tab;
    const name = tab.title || tab.url;
    if (title.textContent !== name) title.textContent = name;
    if (where.textContent !== host(tab.url)) where.textContent = host(tab.url);
    a.href = tab.url;
    a.title = tab.url;
    close.setAttribute("aria-label", "Close " + name);
    const picture = `${tab.favIconUrl || ""} ${host(tab.url)}`;
    if (picture !== drawn) { drawn = picture; icon.replaceChildren(tabIcon(tab)); }
  };
  row.update(first);
  return row;
}

async function renderTabs() {
  const tabs = await otherTabs();
  $("tabCount").textContent = tabs.length ? String(tabs.length) : "";
  $("tabsEmpty").hidden = tabs.length > 0;
  $("saveTabs").disabled = !tabs.length;
  const open = new Set(tabs.map((tab) => tab.id));
  for (const [id, row] of tabRows) if (!open.has(id)) { row.li.remove(); tabRows.delete(id); }
  const rows = tabs.map((tab) => {
    if (tabRows.has(tab.id)) tabRows.get(tab.id).update(tab); else tabRows.set(tab.id, tabRow(tab));
    return tabRows.get(tab.id).li;
  });
  // The list is only rearranged when its order is wrong: moving a row would end a press on it.
  const list = $("tabs");
  if (list.children.length !== rows.length || rows.some((li, i) => list.children[i] !== li)) list.replaceChildren(...rows);
}

async function saveTabs(space) {
  const tabs = await otherTabs();
  if (!tabs.length) return;
  const stamp = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const folder = await chrome.bookmarks.create({ parentId: space.node.id, title: `🗂️ Tabs, ${stamp}` });
  for (const t of tabs) await chrome.bookmarks.create({ parentId: folder.id, title: t.title || t.url, url: t.url });
  toast(`Saved ${tabs.length} tab${tabs.length === 1 ? "" : "s"} as a new collection in ${space.title}.`);
}

dropTarget($("nextPanel"), ["tab"], (d) => addToNext(d.tab));

// Notes are one synced value. Chrome caps a synced value at about 8 KB, so a save can be refused.
const note = $("note");
let noteTimer;
let noteDirty = false;
async function loadNote() {
  if (noteDirty || document.activeElement === note) return;
  const { note: saved = "" } = await chrome.storage.sync.get("note");
  note.value = saved;
}
async function saveNote() {
  clearTimeout(noteTimer);
  if (!noteDirty) return;
  noteDirty = false;
  try {
    await chrome.storage.sync.set({ note: note.value });
    $("noteState").textContent = "saved";
  } catch (err) {
    console.error("note", err);
    $("noteState").textContent = "too long to save: shorten it";
  }
}
note.oninput = () => {
  noteDirty = true;
  $("noteState").textContent = "";
  clearTimeout(noteTimer);
  noteTimer = setTimeout(saveNote, 1200);
};
note.onblur = saveNote;
addEventListener("pagehide", saveNote);
// The same note in a bigger box, for when it is more than a line or two.
const bigNote = (on) => {
  note.closest(".notes").classList.toggle("big", on);
  $("noteBig").textContent = on ? "Shrink" : "Expand";
  $("noteBig").setAttribute("aria-pressed", String(on));
  if (on) note.focus();
};
$("noteBig").onclick = () => bigNote($("noteBig").getAttribute("aria-pressed") !== "true");
note.addEventListener("keydown", (e) => { if (e.key === "Escape") bigNote(false); });

// ---------- wiring ----------
$("edit").onclick = () => {
  const on = !editing();
  document.body.classList.toggle("editing", on);
  $("edit").setAttribute("aria-pressed", String(on));
  $("edit").title = on ? "Done editing" : "Edit: rename, add and remove";
  // Edit adds a + to the strip of spaces, so it is fitted again.
  fitSpaces();
};
$("glance").onclick = () => show(TODAY);

// Where you are is asked in the glance until it is answered, and changed from Today. Setting it
// saves the place; the page redraws when that changes. A place that is only an estimate from
// the network says so, and why when you had pressed the button for the exact one.
const changePlace = async (open = $("todayAsk").hidden) => {
  $("todayAsk").hidden = !open;
  const place = await getPlace();
  const rough = !!place && place.source === "network";
  $("todayAskWhy").hidden = !rough;
  if (rough) $("todayAskWhy").textContent = `${place.name || "This place"} is an estimate from your network. ${place.why || ""} The button tries for the exact spot again; or type a place.`;
};
function placed(place, byHand) {
  $("todayAsk").hidden = true;
  if (place.source !== "network") return;
  const where = place.name || "nearby";
  if (byHand) toast(`${place.why} So this is your network's city instead: ${where}.`, null, { ms: 14000 });
  else toast(`The sky and forecast are for your network's city: ${where}.`, () => { show(TODAY); changePlace(true); }, { label: "Change", ms: 12000 });
}
const asking = placeForm(placed);
$("askForm").append(asking);
$("todayAskForm").append(placeForm(placed));
$("placeBtn").onclick = () => changePlace();

// Extras are switched on and off from the footer; each is a permission Chrome asks for.
const drawExtras = () => { renderExtras(drawExtras); if (!isPage(current)) { renderMail(); renderFiles(); renderClosed(); renderOften(); } };
$("extrasBtn").onclick = () => {
  const open = $("extras").hidden;
  $("extras").hidden = !open;
  $("extrasBtn").setAttribute("aria-expanded", String(open));
  if (open) drawExtras();
};
chrome.permissions.onAdded.addListener(drawExtras);
chrome.permissions.onRemoved.addListener(drawExtras);

// The footer says how to type a short link and leads to the full list. Chrome's own pages can't
// be shown inside this one, so a button marked data-go sends this tab to one.
const hint = $("hint");
hint.append("Type in the address bar: ");
for (const name of ["mail", "cal", "drive", "claude"]) hint.append(el("code", null, `${name}/`), " ");
const all = el("button", "mini", "All shortcuts");
all.type = "button";
all.id = "goShortcuts";
all.onclick = () => show(KEYS);
hint.append("or any link's short name. Add words to search it: ", el("code", null, "mail/invoice"), " ", all);
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) chrome.tabs.update({ url: go.dataset.go });
});
$("version").textContent = `v${chrome.runtime.getManifest().version}`;
$("selfPage").dataset.go = `chrome://extensions/?id=${chrome.runtime.id}`;

// Light and dark: follow the sun, or stay one way. The choice travels with your Chrome profile,
// and a copy is kept where the page can read it before it first paints.
const applyPick = (pick) => {
  if (pick === "light" || pick === "dark") localStorage.setItem("theme", pick); else localStorage.removeItem("theme");
  $("themePick").value = pick === "light" || pick === "dark" ? pick : "sun";
  tickTheme();
};
$("themePick").onchange = () => { applyPick($("themePick").value); chrome.storage.sync.set({ theme: $("themePick").value }); };
chrome.storage.sync.get("theme").then(({ theme }) => applyPick(theme));
chrome.storage.onChanged.addListener((changes, area) => { if (area === "sync" && changes.theme) applyPick(changes.theme.newValue); });

// Redrawing replaces the text boxes, so a change from outside (another tab, sync) waits while one
// of them is being typed in.
const typing = () => !!document.activeElement && document.activeElement.matches("#spaces input, #collections input, #scBody input");
let queued;
function rerender(wait = 60) { clearTimeout(queued); queued = setTimeout(() => (typing() ? rerender(500) : render()), wait); }
for (const ev of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered", "onImportEnded"]) {
  if (chrome.bookmarks[ev]) chrome.bookmarks[ev].addListener(() => rerender());
}
// The sky and the forecast are drawn from what is saved, so a new place or forecast redraws them.
const redrawSky = () => { if (current === TODAY) renderToday(); else if (isPage(current)) tickTheme(); else renderGlance(); };
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.aliases || changes.links)) rerender();
  if (area === "sync" && changes.note) loadNote();
  if (area === "local" && changes.place) warmWeather();
  if (area === "local" && (changes.wx || changes.place)) redrawSky();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redrawSky);

// One redraw at most every 150 ms however many tab events arrive, and none in the middle of a drag.
let tabsQueued = null;
function retabs() {
  if (tabsQueued) return;
  tabsQueued = setTimeout(() => {
    tabsQueued = null;
    if (dragged) return retabs();
    if (!isPage(current)) renderTabs();
  }, 150);
}
for (const ev of ["onCreated", "onRemoved", "onUpdated", "onMoved", "onAttached", "onDetached"]) chrome.tabs[ev].addListener(retabs);

setInterval(() => { if (current === TODAY) tickToday(); else if (isPage(current)) tickTheme(); else renderGlance(); }, 10000);
await loadIcons();
await loadNote();
await render();
warmWeather();

// The very first new tab asks the computer where it is, once, without waiting for a press: the
// extension holds that permission. If the computer can't say, the form says why and waits.
const { placeTried } = await chrome.storage.local.get("placeTried");
const set = await getPlace();
if (!placeTried && !set) {
  await chrome.storage.local.set({ placeTried: true });
  asking.locate();
}
// A typed place stays where it was typed. If the computer has since changed time zone, ask.
if (set && (await leftBehind(set))) {
  toast(`This computer's clock has changed time zone since you set ${set.name}. The sky and forecast are still for ${set.name}.`, [
    { label: "Change", run: () => { show(TODAY); changePlace(true); } },
    { label: "Keep", run: keepPlace },
  ], { ms: 30000 });
}
