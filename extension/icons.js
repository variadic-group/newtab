// Site icons. Chrome's own favicon cache only knows pages you've visited and returns the sign-in
// page's icon for anything behind a login, so icons come from Google's icon service by host name,
// remembered in local storage so each new tab draws them at once.
import { el } from "./dom.js";

const PRODUCT = "https://www.gstatic.com/images/branding/product/2x/";
// Google's own apps answer the icon service with the plain "G", so name their product icons.
const GOOGLE = {
  "mail.google.com": "gmail_2020q4",
  "calendar.google.com": "calendar_2020q4",
  "drive.google.com": "drive_2020q4",
  "keep.google.com": "keep_2020q4",
  "admin.google.com": "admin_2020q4",
  "meet.google.com": "meet_2020q4",
  "docs.google.com": "docs_2020q4",
  "console.cloud.google.com": "google_cloud",
};
// Docs, Sheets, Slides and Forms share one host; the first part of the path says which it is.
const FILES = { document: "docs_2020q4", spreadsheets: "sheets_2020q4", presentation: "slides_2020q4", forms: "forms_2020q4" };
const RETRY_MS = 7 * 864e5;

let cache = {};
const pending = new Map();
let saveTimer;

export function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export async function loadIcons() {
  cache = (await chrome.storage.local.get("icons")).icons || {};
}

// What an address's icon is remembered under: its host, or host/kind for a Google file.
function keyOf(url) {
  const h = host(url);
  if (h !== "docs.google.com") return h;
  const kind = new URL(url).pathname.split("/")[1];
  return FILES[kind] ? `${h}/${kind}` : h;
}

// A subdomain the service doesn't know often shares its parent's icon (account.example.com,
// example.com, www.example.com).
function candidates(key) {
  const [h, kind] = key.split("/");
  const product = [FILES[kind], GOOGLE[h]].filter(Boolean);
  if (product.length) return product.map((name) => `${PRODUCT}${name}_48dp.png`);
  const labels = h.split(".");
  if (labels.length < 2) return [];
  const names = [h];
  for (let i = 1; i <= labels.length - 2; i++) names.push(labels.slice(i).join("."));
  names.push("www." + names[names.length - 1]);
  return names.map((n) => `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(n)}`);
}

// The service answers an unknown site with a 16px globe, so anything that small is a miss.
const loads = (src) => new Promise((resolve) => {
  const i = new Image();
  i.onload = () => resolve(i.naturalWidth >= 24);
  i.onerror = () => resolve(false);
  i.src = src;
});

function find(key) {
  if (!pending.has(key)) pending.set(key, (async () => {
    let src = "";
    for (const c of candidates(key)) if (await loads(c)) { src = c; break; }
    cache[key] = { src, at: Date.now() };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.local.set({ icons: cache }), 400);
    return src;
  })());
  return pending.get(key);
}

function monogram(name, h) {
  const letter = (name || h || "?").replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase() || "?";
  const m = el("span", "mono", letter);
  let hue = 0;
  for (const ch of h || name || "") hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  m.style.background = `hsl(${hue} 40% 46%)`;
  return m;
}

export function siteIcon(url, name) {
  const box = el("span", "sico");
  const h = host(url);
  const show = (src) => {
    const img = el("img");
    img.alt = "";
    img.onerror = () => box.replaceChildren(monogram(name, h));
    img.src = src;
    box.replaceChildren(img);
  };
  const key = h && keyOf(url);
  const hit = cache[key];
  if (hit && hit.src) show(hit.src);
  else {
    box.append(monogram(name, h));
    if (h && (!hit || Date.now() - hit.at > RETRY_MS)) find(key).then((src) => { if (src) show(src); });
  }
  return box;
}

// An open tab already carries the icon its page is showing.
export function tabIcon(tab) {
  if (!/^(https?:|data:)/.test(tab.favIconUrl || "")) return siteIcon(tab.url, tab.title);
  const box = el("span", "sico");
  const img = el("img");
  img.alt = "";
  img.onerror = () => box.replaceWith(siteIcon(tab.url, tab.title));
  img.src = tab.favIconUrl;
  box.append(img);
  return box;
}
