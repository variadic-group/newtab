// Two things beyond your bookmarks, each off until switched on in Settings, when Chrome asks for
// its permission: your unread mail count, as a badge on a Gmail link in the space you are looking
// at; and the sites you visit most that you haven't saved, as a row to drag into a collection.
import { $, el } from "./dom.js";
import { siteIcon, host } from "./icons.js";

const OFTEN = { permissions: ["topSites"] };
const MAIL = { origins: ["https://mail.google.com/*"] };
const isOften = () => chrome.permissions.contains(OFTEN);
const isMail = () => chrome.permissions.contains(MAIL);

// The switches, in Settings. Chrome only shows its permission prompt straight from a click, so the
// request is the first thing the click does. Sites you put away can be brought back from here.
function toggle(label, on, ask, done) {
  const b = el("button", "btn", on ? "On" : "Off");
  b.type = "button";
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", label);
  b.onclick = async () => {
    if (on) await chrome.permissions.remove(ask); else await chrome.permissions.request(ask);
    done();
  };
  return b;
}
function row(label, note, button, ...more) {
  const text = el("div");
  text.append(el("b", null, label), el("p", "cap", note), ...more);
  const r = el("div", "extra");
  r.append(text, button);
  return r;
}
export async function renderExtras(done) {
  const [mailOn, oftenOn] = await Promise.all([isMail(), isOften()]);
  const { hiddenSites = [] } = await chrome.storage.sync.get("hiddenSites");
  const back = [];
  if (hiddenSites.length) {
    const b = el("button", "mini", `Show the ${hiddenSites.length} you put away`);
    b.type = "button";
    b.onclick = async () => { await chrome.storage.sync.remove("hiddenSites"); done(); };
    back.push(b);
  }
  $("extrasBody").replaceChildren(
    row("Unread mail", "A count on your Gmail links, with who the newest are from when you point at it. Read with this browser's own Gmail sign-in and kept on this computer. Chrome will ask to read mail.google.com.", toggle("Unread mail", mailOn, MAIL, done)),
    row("Sites you visit but haven't saved", "A row above your collections of the sites you go to most that aren't in your bookmarks. Drag one onto a collection to keep it; × puts one away for good. Chrome will ask to read your most visited sites.", toggle("Sites you visit but haven't saved", oftenOn, OFTEN, done), ...back),
  );
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

// The count sits on the Gmail links on the page, the way an app's icon carries one; pointing at
// it says who the newest are from. Nothing unread, no badge.
function badge(links, mail) {
  const say = [`${mail.count} unread in your inbox`, ...(mail.latest || []).map((m) => `${m.from}: ${m.subject}`)].join("\n");
  for (const a of links) {
    const icon = a.querySelector(".sico");
    let b = icon.querySelector(".badge");
    if (!mail.count) { if (b) b.remove(); continue; }
    if (!b) { b = el("b", "badge"); icon.append(b); }
    b.textContent = mail.count > 99 ? "99+" : String(mail.count);
    b.title = say;
  }
}

// Gmail is asked only when a Gmail link is on screen, and at most every five minutes.
export async function renderMail() {
  const links = [...document.querySelectorAll("#collections a.tile")].filter((a) => GMAIL.test(a.href));
  if (!links.length || !(await isMail())) return;
  const { mail } = await chrome.storage.local.get("mail");
  if (mail) badge(links, mail);
  if (mail && Date.now() - mail.at < MAIL_FRESH_MS) return;
  try {
    const fresh = { ...(await unread()), at: Date.now() };
    await chrome.storage.local.set({ mail: fresh });
    badge(links, fresh);
  } catch (err) {
    // The badge keeps the last count it had, or stays away if it never had one.
    console.warn("mail:", err.message);
  }
}

// ---------- sites you visit but haven't saved ----------
const web = (u) => /^https?:/.test(u || "");
const bare = (u) => host(u).replace(/^www\./, "");

// `saved` is every bookmark's URL. A site counts as saved if any bookmark is on the same host.
export async function renderOften(saved, drags) {
  const row = $("often");
  if (!(await isOften())) { row.hidden = true; return; }
  const { hiddenSites = [] } = await chrome.storage.sync.get("hiddenSites");
  const have = new Set(saved.filter(web).map(bare));
  const sites = (await chrome.topSites.get()).filter((s) => web(s.url) && !have.has(bare(s.url)) && !hiddenSites.includes(bare(s.url))).slice(0, 8);
  row.hidden = !sites.length;
  const say = el("span", "often-say", "Visited often, not saved");
  row.replaceChildren(say, ...sites.map((s) => {
    const a = el("a", "chip-site");
    a.href = s.url;
    a.title = `${s.title || s.url}. Drag onto a collection to save it.`;
    a.append(siteIcon(s.url, s.title), el("span", "t", bare(s.url)));
    const x = el("button", "x", "×");
    x.type = "button";
    x.setAttribute("aria-label", `Don't show ${bare(s.url)} again`);
    x.title = "Don't show this again (Settings can bring it back)";
    x.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      await chrome.storage.sync.set({ hiddenSites: [...hiddenSites, bare(s.url)] });
    };
    a.append(x);
    drags(a, () => ({ kind: "site", tab: { title: s.title || bare(s.url), url: s.url } }));
    return a;
  }));
}
