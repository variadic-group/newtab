// Things this page shows only if you turn them on, each behind a permission Chrome asks you for
// at that moment: your unread mail count, as a badge on your Gmail links; and, on the Recent
// page, the tabs you closed, the ones open on your other devices, the Google files you opened
// lately and the sites you visit most. Whether one is on is simply whether its permission is
// held.
import { $, el } from "./dom.js";
import { siteIcon, host } from "./icons.js";

const EXTRAS = {
  mail: { ask: { origins: ["https://mail.google.com/*"] }, label: "Unread mail", note: "How many unread messages are in your Gmail inbox, as a badge on your Gmail links, with who they are from when you point at it. Chrome will ask to read mail.google.com." },
  docs: { ask: { permissions: ["history"] }, label: "Recent files", note: "The Google Docs, Sheets, Slides and Forms you opened lately, from this browser's history, on the Recent page. Chrome will ask to read your history." },
  closed: { ask: { permissions: ["sessions"] }, label: "Closed tabs and other devices", note: "Tabs you closed lately, to reopen, and the tabs open on your phone and other computers signed in to this Chrome profile, on the Recent page. Chrome will ask to read your history on your signed-in devices." },
  often: { ask: { permissions: ["topSites"] }, label: "Most visited", note: "The sites you go to most, on the Recent page. Chrome will ask to read your most visited sites." },
};
const isOn = (name) => chrome.permissions.contains(EXTRAS[name].ask);

// The switches. Chrome only shows its permission prompt straight from a click, so the request is
// the first thing the click does.
export async function renderExtras(done) {
  const rows = [];
  for (const [name, x] of Object.entries(EXTRAS)) {
    const on = await isOn(name);
    const b = el("button", "btn", on ? "On" : "Off");
    b.type = "button";
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", x.label);
    b.onclick = async () => {
      if (on) await chrome.permissions.remove(x.ask); else await chrome.permissions.request(x.ask);
      done();
    };
    const text = el("div");
    text.append(el("b", null, x.label), el("p", "cap", x.note));
    const row = el("div", "extra");
    row.append(text, b);
    rows.push(row);
  }
  $("extrasBody").replaceChildren(...rows);
}

// ---------- unread mail ----------
const MAIL_FRESH_MS = 5 * 60e3;
const GMAIL = /^https:\/\/mail\.google\.com\//;

// Gmail's inbox feed, read with the browser's own sign-in: the first account in this profile.
// It carries the count and the newest unread messages' senders and subjects.
async function unread() {
  const r = await fetch("https://mail.google.com/mail/u/0/feed/atom", { credentials: "include", cache: "no-store" });
  if (!r.ok) throw new Error(`Gmail answered ${r.status}`);
  const doc = new DOMParser().parseFromString(await r.text(), "application/xml");
  const count = doc.querySelector("fullcount");
  if (!count) throw new Error("Gmail sent no count; this profile may not be signed in to it");
  const latest = [...doc.querySelectorAll("entry")].slice(0, 5).map((e) => ({
    from: (e.querySelector("author > name") || {}).textContent || "",
    subject: (e.querySelector("title") || {}).textContent || "(no subject)",
  }));
  return { count: +count.textContent, latest };
}

// The count sits on every Gmail link on the page, the way an app's icon carries one. Pointing at
// it says who the newest are from. With no Gmail link in view, the strip at the top carries it.
function badge(mail) {
  const say = mail.count
    ? [`${mail.count} unread in your inbox`, ...(mail.latest || []).map((m) => `${m.from}: ${m.subject}`)].join("\n")
    : "Nothing unread in your inbox";
  let shown = 0;
  for (const a of document.querySelectorAll("#collections a.tile")) {
    if (!GMAIL.test(a.href)) continue;
    const icon = a.querySelector(".sico");
    let b = icon.querySelector(".badge");
    if (!mail.count) { if (b) b.remove(); shown++; continue; }
    if (!b) { b = el("b", "badge"); icon.append(b); }
    b.textContent = mail.count > 99 ? "99+" : String(mail.count);
    b.title = say;
    shown++;
  }
  $("glMailCount").textContent = mail.count;
  $("glMail").title = say;
  $("glMail").hidden = shown > 0;
}

export async function renderMail() {
  const clear = () => { document.querySelectorAll("#collections .sico .badge").forEach((b) => b.remove()); $("glMail").hidden = true; };
  if (!(await isOn("mail"))) return clear();
  const { mail } = await chrome.storage.local.get("mail");
  if (mail) badge(mail);
  if (mail && Date.now() - mail.at < MAIL_FRESH_MS) return;
  try {
    const fresh = { ...(await unread()), at: Date.now() };
    await chrome.storage.local.set({ mail: fresh });
    badge(fresh);
  } catch (err) {
    // The badge keeps the last count it had, or stays away if it never had one.
    console.warn("mail:", err.message);
    if (!mail) clear();
  }
}

// ---------- recent files ----------
const FILE = /^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation|forms)\/d\/([\w-]+)/;

async function recentFiles() {
  const visits = await chrome.history.search({ text: "docs.google.com", startTime: Date.now() - 30 * 864e5, maxResults: 400 });
  const files = new Map();
  for (const v of visits.sort((a, b) => b.lastVisitTime - a.lastVisitTime)) {
    const m = FILE.exec(v.url || "");
    if (!m || !v.title || files.has(m[2])) continue;
    files.set(m[2], { url: m[0] + "/edit", title: v.title.replace(/ - Google (Docs|Sheets|Slides|Forms)$/, "") });
  }
  return [...files.values()].slice(0, 6);
}

// ---------- closed tabs and other devices ----------
const web = (tab) => !!tab && /^https?:/.test(tab.url || "");
const row = (tab) => {
  const a = el("a", "row");
  a.href = tab.url;
  a.title = tab.url;
  a.append(siteIcon(tab.url, tab.title), el("span", "t", tab.title || tab.url), el("span", "h", host(tab.url)));
  const li = el("li");
  li.append(a);
  return li;
};

// ---------- the Recent page ----------
// Where you were: four cards, each its own extra. One that is off says what it would show and
// asks for its permission from its own button, since Chrome only asks straight from a click.
function card(title, sub) {
  const c = el("article", "sc-card");
  c.append(el("h2", null, title), el("p", "cap", sub));
  return c;
}
function rowsOf(items, none) {
  if (!items.length) return el("p", "note", none);
  const list = el("ul", "rows");
  list.append(...items);
  return list;
}
async function offer(c, name, redraw) {
  const b = el("button", "btn", "Show them");
  b.type = "button";
  b.onclick = async () => { if (await chrome.permissions.request(EXTRAS[name].ask)) redraw(); };
  c.append(b);
  return c;
}

async function closedCard(redraw) {
  const c = card("Recently closed", "Tabs and windows you closed, to reopen where they were, with their history.");
  if (!(await isOn("closed"))) return offer(c, "closed", redraw);
  const closed = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
  const items = closed.map((s) => {
    const tabs = (s.window ? s.window.tabs : [s.tab]).filter(web);
    if (!tabs.length) return null;
    const li = row(s.window && tabs.length > 1 ? { ...tabs[0], title: `Window: ${tabs[0].title || host(tabs[0].url)} and ${tabs.length - 1} more` } : tabs[0]);
    li.firstChild.onclick = (e) => { e.preventDefault(); chrome.sessions.restore((s.window || s.tab).sessionId); };
    return li;
  }).filter(Boolean).slice(0, 12);
  c.append(rowsOf(items, "Tabs you close will show here, to reopen."));
  return c;
}
async function devicesCard(redraw) {
  const c = card("On your other devices", "The tabs open on your phone and other computers signed in to this Chrome profile.");
  if (!(await isOn("closed"))) return offer(c, "closed", redraw);
  const devices = await chrome.sessions.getDevices({ maxResults: 6 });
  const parts = devices.flatMap((d) => {
    const tabs = d.sessions.flatMap((s) => (s.window ? s.window.tabs : [s.tab])).filter(web).slice(0, 8);
    return tabs.length ? [el("h3", null, d.deviceName), rowsOf(tabs.map(row), "")] : [];
  });
  c.append(...(parts.length ? parts : [el("p", "note", "No other device signed in to this profile has a tab open, or Chrome sync is off for open tabs.")]));
  return c;
}
async function filesCard(redraw) {
  const c = card("Google files", "The Docs, Sheets, Slides and Forms you opened in this browser in the last month.");
  if (!(await isOn("docs"))) return offer(c, "docs", redraw);
  const files = await recentFiles();
  c.append(rowsOf(files.map((f) => {
    const a = el("a", "row");
    a.href = f.url;
    a.append(siteIcon(f.url, f.title), el("span", "t", f.title));
    const li = el("li");
    li.append(a);
    return li;
  }), "Google Docs, Sheets and Slides you open will show here."));
  return c;
}
async function oftenCard(redraw) {
  const c = card("Most visited", "The sites you go to most, as Chrome counts them.");
  if (!(await isOn("often"))) return offer(c, "often", redraw);
  const sites = (await chrome.topSites.get()).filter(web).slice(0, 12);
  c.append(rowsOf(sites.map(row), "Chrome hasn't counted any yet."));
  return c;
}

let watchingSessions = false;
export async function renderRecent(box, redraw) {
  if (!watchingSessions && (await isOn("closed"))) { watchingSessions = true; chrome.sessions.onChanged.addListener(redraw); }
  const cards = await Promise.all([closedCard(redraw), devicesCard(redraw), filesCard(redraw), oftenCard(redraw)]);
  box.replaceChildren(...cards);
}
