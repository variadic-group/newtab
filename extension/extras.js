// Two things this page shows only if you turn them on, each behind a permission Chrome asks you
// for at that moment: your unread mail count, and the Google files you opened lately. Whether one
// is on is simply whether its permission is held.
import { $, el } from "./dom.js";
import { siteIcon } from "./icons.js";

const EXTRAS = {
  mail: { ask: { origins: ["https://mail.google.com/*"] }, label: "Unread mail", note: "How many unread messages are in your Gmail inbox, in the strip at the top. Chrome will ask to read mail.google.com." },
  docs: { ask: { permissions: ["history"] }, label: "Recent files", note: "The Google Docs, Sheets, Slides and Forms you opened lately, from this browser's history. Chrome will ask to read your history." },
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
