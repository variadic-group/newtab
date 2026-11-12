import { $, el } from "./dom.js";
import { loadIcons, siteIcon, tabIcon, host } from "./icons.js";
import { BUILTIN, barChildren, leaves, aliasTable, aliasFor, nextFolder, addToNext } from "./shared.js";
import { renderShortcuts, aliasPill } from "./shortcuts.js";
import { renderToday, tickToday, tickTheme, renderGlance, warmWeather } from "./today.js";
import { placeForm } from "./place.js";
import { renderExtras, renderMail, renderFiles } from "./extras.js";

const TODAY = "today";
const KEYS = "shortcuts";
const isPage = (id) => id === TODAY || id === KEYS;
let current = null;
let pendingRename = null;

const editing = () => document.body.classList.contains("editing");
const label = (node) => node.title || host(node.url) || node.url;

let toastTimer;
function toast(text, undo) {
  const t = $("toast");
  t.replaceChildren(el("span", null, text));
  if (undo) { const b = el("button", null, "Undo"); b.type = "button"; b.onclick = () => { undo(); t.hidden = true; }; t.append(b); }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

// ---------- drag and drop ----------
// What is being dragged: a "link" tile, a "next" item, a "folder" (a card), a "space" tab or an
// open "tab". Dragging works all the time, not only in Edit.
let dragged = null;
const takes = (accepts) => dragged && accepts.includes(dragged.kind);

function drags(node, what, mark = node) {
  node.draggable = true;
  node.addEventListener("dragstart", () => { dragged = { ...what, el: mark }; mark.classList.add("dragging"); });
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

  $("spaces").replaceChildren(...all.map((s) => tabFor(s.id, s.title, s)));
  $("pages").replaceChildren(tabFor(TODAY, "☀️ Today"), tabFor(KEYS, "⌨️ Shortcuts"));
  $("today").hidden = current !== TODAY;
  $("shortcuts").hidden = current !== KEYS;
  $("space").hidden = isPage(current);
  $("edit").hidden = isPage(current);
  $("empty").hidden = all.length > 0 || isPage(current);
  if (current === TODAY) return renderToday();
  if (current === KEYS) return renderShortcuts($("scBody"), render);
  const space = all.find((s) => s.id === current);
  if (space) await renderSpace(space);
  await Promise.all([renderGlance(), renderNext(), renderTabs(), renderMail(), renderFiles()]);
}

function show(id) {
  current = id;
  // A new tab reopens on the last space, never on Today or Shortcuts.
  if (!isPage(id)) chrome.storage.local.set({ space: id });
  render();
}

function tabFor(id, title, space) {
  const b = el("button", "tab", title);
  b.type = "button";
  b.setAttribute("role", "tab");
  b.setAttribute("aria-selected", String(id === current));
  b.onclick = () => show(id);
  if (space && !space.pinned) {
    dropTarget(b, ["link", "next", "folder", "tab"], (d) => place(d, { parentId: space.id }));
    drags(b, { kind: "space", id: space.id });
    orderTarget(b, ["space"], "x", (d, before) => place(d, slot(space.node, before)));
  }
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
  $("saveTabs").onclick = () => saveTabs(space);
  $("saveTabs").hidden = !!space.pinned;
  if (pendingRename) {
    const h = document.querySelector(`[data-folder="${pendingRename}"] h2`);
    pendingRename = null;
    if (h) startRename(h);
  }
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
  a.title = alias ? `${alias}/  ·  ${host(link.url)}` : host(link.url);
  a.append(siteIcon(link.url, link.title), el("span", "name", label(link)), aliasPill(link, table, render));
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

// A group's heading shows its whole path; only its own name is edited.
function startRename(h) {
  const was = h.dataset.name ?? h.textContent;
  const input = el("input", "rename");
  input.value = was;
  h.replaceWith(input);
  input.focus(); input.select();
  const done = async (save) => {
    input.onblur = null;
    const v = input.value.trim();
    if (save && v && v !== was) { input.blur(); await chrome.bookmarks.update(h.dataset.id, { title: v }); }
    else input.replaceWith(h);
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

async function renderTabs() {
  const tabs = await otherTabs();
  $("tabCount").textContent = tabs.length ? String(tabs.length) : "";
  $("tabsEmpty").hidden = tabs.length > 0;
  $("saveTabs").disabled = !tabs.length;
  $("tabs").replaceChildren(...tabs.map((tab) => {
    const li = el("li");
    const title = tab.title || tab.url;
    const a = rowLink(tab.url, title, tabIcon(tab));
    a.onclick = (e) => { e.preventDefault(); chrome.tabs.update(tab.id, { active: true }); };
    const add = el("button", "mini", "Up next");
    add.type = "button";
    add.title = "Keep this page under Up next";
    add.onclick = async () => toast((await addToNext(tab)) ? "Added to Up next." : "Already in Up next.");
    const close = el("button", "mini close", "×");
    close.type = "button";
    close.title = "Close this tab";
    close.setAttribute("aria-label", "Close " + title);
    close.onclick = async () => {
      await chrome.tabs.remove(tab.id);
      toast(`Closed ${title}`, () => chrome.tabs.create({ url: tab.url, index: tab.index, active: false }));
    };
    li.append(a, add, close);
    drags(li, { kind: "tab", tab: { id: tab.id, index: tab.index, title: tab.title, url: tab.url } });
    // tabs.move counts the index after the tab has left its old place, unlike bookmarks.move.
    orderTarget(li, ["tab"], "y", (d, before) => {
      const to = before ? tab.index : tab.index + 1;
      return chrome.tabs.move(d.tab.id, { index: d.tab.index < to ? to - 1 : to });
    });
    return li;
  }));
}

async function saveTabs(space) {
  const tabs = await otherTabs();
  if (!tabs.length) return;
  const stamp = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const folder = await chrome.bookmarks.create({ parentId: space.node.id, title: `🗂️ Tabs · ${stamp}` });
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

// ---------- wiring ----------
$("edit").onclick = () => {
  const on = !editing();
  document.body.classList.toggle("editing", on);
  $("edit").setAttribute("aria-pressed", String(on));
  $("edit").textContent = on ? "Done" : "Edit";
};
$("glance").onclick = () => show(TODAY);

// Where you are is asked in the glance until it is answered, and changed from Today. Setting it
// saves the place; the page redraws when that changes.
$("askForm").append(placeForm(() => {}));
$("todayAskForm").append(placeForm(() => {}));
$("placeBtn").onclick = () => { $("todayAsk").hidden = !$("todayAsk").hidden; };

// Extras are switched on and off from the footer; each is a permission Chrome asks for.
const drawExtras = () => { renderExtras(drawExtras); if (!isPage(current)) { renderMail(); renderFiles(); } };
$("extrasBtn").onclick = () => {
  const open = $("extras").hidden;
  $("extras").hidden = !open;
  $("extrasBtn").setAttribute("aria-expanded", String(open));
  if (open) drawExtras();
};
chrome.permissions.onAdded.addListener(drawExtras);
chrome.permissions.onRemoved.addListener(drawExtras);

// The footer: the short links, and the Chrome pages this page can't show inside itself.
const hint = $("hint");
hint.append("In the address bar: ");
for (const name of Object.keys(BUILTIN)) hint.append(el("code", null, `${name}/`), " ");
hint.append("or any link's short name; ", el("code", null, "claude"), " then Tab asks Claude.");
$("goShortcuts").onclick = () => show(KEYS);
for (const b of document.querySelectorAll("[data-go]")) b.onclick = () => chrome.tabs.update({ url: b.dataset.go });
$("version").textContent = `v${chrome.runtime.getManifest().version}`;

// Redrawing replaces the text boxes, so a change from outside (another tab, sync) waits while one
// of them is being typed in.
const typing = () => !!document.activeElement && document.activeElement.matches("#collections input, #scBody input");
let queued;
function rerender(wait = 60) { clearTimeout(queued); queued = setTimeout(() => (typing() ? rerender(500) : render()), wait); }
for (const ev of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered", "onImportEnded"]) {
  if (chrome.bookmarks[ev]) chrome.bookmarks[ev].addListener(() => rerender());
}
// The sky and the forecast are drawn from what is saved, so a new place or forecast redraws them.
const redrawSky = () => { if (current === TODAY) renderToday(); else if (current === KEYS) tickTheme(); else renderGlance(); };
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.aliases || changes.links)) rerender();
  if (area === "sync" && changes.note) loadNote();
  if (area === "local" && changes.place) warmWeather();
  if (area === "local" && (changes.wx || changes.place)) redrawSky();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redrawSky);

let tabsQueued;
const retabs = () => { clearTimeout(tabsQueued); tabsQueued = setTimeout(() => { if (!isPage(current)) renderTabs(); }, 150); };
for (const ev of ["onCreated", "onRemoved", "onUpdated", "onMoved", "onAttached", "onDetached"]) chrome.tabs[ev].addListener(retabs);

setInterval(() => { if (current === TODAY) tickToday(); else if (current === KEYS) tickTheme(); else renderGlance(); }, 10000);
await loadIcons();
await loadNote();
await render();
warmWeather();
