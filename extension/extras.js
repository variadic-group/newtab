// Things this page shows only if you turn them on, each behind a permission Chrome asks you for
// at that moment: your unread mail count, the Google files you opened lately, the tabs you
// closed and the ones open on your other devices, and the sites you visit most. Whether one is
// on is simply whether its permission is held.
import { $, el } from "./dom.js";
import { siteIcon, host } from "./icons.js";

const EXTRAS = {
  mail: { ask: { origins: ["https://mail.google.com/*"] }, label: "Unread mail", note: "How many unread messages are in your Gmail inbox, in the strip at the top. Chrome will ask to read mail.google.com." },
  docs: { ask: { permissions: ["history"] }, label: "Recent files", note: "The Google Docs, Sheets, Slides and Forms you opened lately, from this browser's history. Chrome will ask to read your history." },
  closed: { ask: { permissions: ["sessions"] }, label: "Closed tabs and other devices", note: "Tabs you closed lately, to reopen, and the tabs open on your phone and other computers signed in to this Chrome profile. Chrome will ask to read your history on your signed-in devices." },
  often: { ask: { permissions: ["topSites"] }, label: "Most visited", note: "A row of the sites you go to most, above your collections. Chrome will ask to read your most visited sites." },
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

// Gmail's inbox feed, read with the browser's own sign-in: the first account in this profile.
async function unread() {
  const r = await fetch("https://mail.google.com/mail/u/0/feed/atom", { credentials: "include", cache: "no-store" });
  if (!r.ok) throw new Error(`Gmail answered ${r.status}`);
  const count = new DOMParser().parseFromString(await r.text(), "application/xml").querySelector("fullcount");
  if (!count) throw new Error("Gmail sent no count; this profile may not be signed in to it");
  return +count.textContent;
}

export async function renderMail() {
  const chip = $("glMail");
  if (!(await isOn("mail"))) { chip.hidden = true; return; }
  const { mail } = await chrome.storage.local.get("mail");
  const show = (m) => { $("glMailCount").textContent = m.count; chip.hidden = false; };
  if (mail) show(mail);
  if (mail && Date.now() - mail.at < MAIL_FRESH_MS) return;
  try {
    const fresh = { count: await unread(), at: Date.now() };
    await chrome.storage.local.set({ mail: fresh });
    show(fresh);
  } catch (err) {
    // The chip keeps the last count it had, or stays away if it never had one.
    console.warn("mail:", err.message);
    chip.hidden = !mail;
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

export async function renderFiles() {
  const on = await isOn("docs");
  $("filesPanel").hidden = !on;
  if (!on) return;
  const files = await recentFiles();
  $("filesEmpty").hidden = files.length > 0;
  $("files").replaceChildren(...files.map((f) => {
    const a = el("a", "row");
    a.href = f.url;
    a.append(siteIcon(f.url, f.title), el("span", "t", f.title));
    const li = el("li");
    li.append(a);
    return li;
  }));
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

let watchingSessions = false;
export async function renderClosed() {
  const on = await isOn("closed");
  $("closedPanel").hidden = !on;
  if (!on) return;
  // The list changes as tabs close; the listener can only be added once the permission is held.
  if (!watchingSessions) { watchingSessions = true; chrome.sessions.onChanged.addListener(renderClosed); }
  const [closed, devices] = await Promise.all([chrome.sessions.getRecentlyClosed({ maxResults: 10 }), chrome.sessions.getDevices({ maxResults: 4 })]);
  // A closed tab comes back where it was, with its history; a closed window comes back whole.
  const items = closed.map((s) => {
    const tabs = (s.window ? s.window.tabs : [s.tab]).filter(web);
    if (!tabs.length) return null;
    const li = row(s.window && tabs.length > 1 ? { ...tabs[0], title: `Window: ${tabs[0].title || host(tabs[0].url)} and ${tabs.length - 1} more` } : tabs[0]);
    li.firstChild.onclick = (e) => { e.preventDefault(); chrome.sessions.restore((s.window || s.tab).sessionId); };
    return li;
  }).filter(Boolean).slice(0, 6);
  $("closed").replaceChildren(...items);
  $("closedEmpty").hidden = items.length > 0;
  $("devices").replaceChildren(...devices.flatMap((d) => {
    const tabs = d.sessions.flatMap((s) => (s.window ? s.window.tabs : [s.tab])).filter(web).slice(0, 6);
    if (!tabs.length) return [];
    const list = el("ul", "rows");
    list.append(...tabs.map(row));
    return [el("h3", null, d.deviceName), list];
  }));
}

// ---------- most visited ----------
export async function renderOften() {
  const on = await isOn("often");
  const sites = on ? (await chrome.topSites.get()).filter(web).slice(0, 8) : [];
  $("often").hidden = !sites.length;
  $("often").replaceChildren(...sites.map((s) => {
    const a = el("a", "pin");
    a.href = s.url;
    a.title = s.title || s.url;
    a.append(siteIcon(s.url, s.title), el("span", "t", host(s.url).replace(/^www\./, "")));
    return a;
  }));
}
