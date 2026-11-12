// The Tools page: checks a person runs now and then, about the connection and this browser.
// Nothing reaches the network until its button is pressed, and each card says who it asks. The
// three network checks ask Cloudflare, whose measurement endpoints answer any page without a key.
// What needs a test site with servers of its own (how unique a fingerprint is, where DNS
// lookups go) is a link at the bottom, not an imitation.
import { el } from "./dom.js";
import { getPlace } from "./place.js";

const CF = "https://speed.cloudflare.com";
const V4 = "https://1.1.1.1/cdn-cgi/trace";
const V6 = "https://[2606:4700:4700::1111]/cdn-cgi/trace";
const within = (ms) => ({ cache: "no-store", signal: AbortSignal.timeout(ms) });
const text = (v) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

// ---------- small parts ----------
function card(title, note) {
  const box = el("article", "sc-card tool");
  box.append(el("h2", null, title), el("p", "sc-note lead", note));
  return box;
}

// A list of name and value. A value is text, or a node (a link, a button beside the text).
function facts(rows) {
  const dl = el("dl", "facts");
  for (const [name, value] of rows) {
    const dd = el("dd");
    dd.append(...[].concat(value));
    dl.append(el("dt", null, name), dd);
  }
  return dl;
}

function copyable(value) {
  const b = el("button", "mini", "Copy");
  b.type = "button";
  b.setAttribute("aria-label", `Copy ${value}`);
  b.onclick = async () => {
    // Chrome can refuse the clipboard (the page lost focus); say so and leave the text to select.
    try { await navigator.clipboard.writeText(value); b.textContent = "Copied"; } catch (err) { console.warn("copy:", err.message); b.textContent = "Couldn't copy"; }
    setTimeout(() => { b.textContent = "Copy"; }, 1500);
  };
  return [el("code", null, value), " ", b];
}

// A card whose work starts on a press. `run(say)` resolves with what to show; `say` reports
// progress meanwhile. A failure is shown in the card, with the reason.
function check(title, note, label, run) {
  const box = card(title, note);
  const go = el("button", "btn", label);
  go.type = "button";
  const out = el("div", "out");
  out.setAttribute("role", "status");
  const say = (t) => out.replaceChildren(el("p", "note", t));
  go.onclick = async () => {
    go.disabled = true;
    say("Checking…");
    try { out.replaceChildren(...[].concat(await run(say))); } catch (err) { console.warn(`${title}:`, err.message); say(`That didn't work: ${err.message}.`); }
    go.disabled = false;
    go.textContent = `${label} again`;
  };
  box.append(go, out);
  return box;
}

// ---------- connection ----------
// Cloudflare's trace page: one "name=value" a line, about the request that fetched it.
async function trace(url) {
  const r = await fetch(url, within(5000));
  if (!r.ok) throw new Error(`Cloudflare answered ${r.status}`);
  return Object.fromEntries((await r.text()).trim().split("\n").map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
}

// The address each family of the internet sees this computer at. A network without IPv6 has
// no second one, which is not a failure. The last answer is kept for the WebRTC check.
let seen = null;
async function addresses() {
  const [v4, v6] = await Promise.allSettled([trace(V4), trace(V6)]);
  seen = { v4: v4.status === "fulfilled" ? text(v4.value.ip) : "", v6: v6.status === "fulfilled" ? text(v6.value.ip) : "", warp: v4.status === "fulfilled" && v4.value.warp === "on" };
  if (!seen.v4 && !seen.v6) throw new Error("Cloudflare couldn't be reached");
  return seen;
}

function kmBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const far = (km) => `about ${(Math.round(km / 10) * 10).toLocaleString()} km (${(Math.round(km / 16.09) * 10).toLocaleString()} mi)`;

async function connection() {
  const [at, meta, place] = await Promise.all([
    addresses(),
    fetch(`${CF}/meta`, within(8000)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    getPlace(),
  ]);
  const rows = [
    ["IPv4 address", at.v4 ? copyable(at.v4) : "none"],
    ["IPv6 address", at.v6 ? copyable(at.v6) : "none on this network"],
  ];
  const lines = [];
  if (meta) {
    let country = text(meta.country);
    try { country = new Intl.DisplayNames([navigator.language], { type: "region" }).of(country) || country; } catch { /* not a region code: show what was sent */ }
    rows.push(["Exits in", [text(meta.city), text(meta.region), country].filter(Boolean).join(", ") || "unknown"]);
    if (Number.isInteger(meta.asn)) {
      const who = el("a", null, `AS${meta.asn}`);
      who.href = `https://radar.cloudflare.com/as${meta.asn}`;
      who.title = "Whose network this is, on Cloudflare Radar";
      rows.push(["Network", who]);
    }
    if (meta.colo && text(meta.colo.iata)) rows.push(["Reached Cloudflare at", [text(meta.colo.iata), text(meta.colo.city)].filter(Boolean).join(", ")]);
    const exit = { lat: +meta.latitude, lon: +meta.longitude };
    if (place && Number.isFinite(exit.lat) && Number.isFinite(exit.lon)) {
      const km = kmBetween(place, exit);
      const here = place.name || "the place this page is set to";
      lines.push(km > 150
        ? `This exit is ${far(km)} from ${here}, so a VPN or proxy is probably in the way.`
        : `This exit is near ${here}. A VPN that exits near you looks the same as none.`);
    } else if (!place) lines.push("Set a place on Today and this will say how far the exit is from you.");
  }
  if (at.warp) lines.push("Cloudflare WARP is on.");
  return [facts(rows), ...lines.map((l) => el("p", "note", l))];
}

// ---------- WebRTC ----------
// The addresses a page can learn through WebRTC, by asking a STUN server what it sees.
function candidates() {
  return new Promise((resolve, reject) => {
    const found = { open: new Set(), local: new Set(), hidden: 0 };
    let pc;
    try { pc = new RTCPeerConnection({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }] }); } catch (err) { return reject(err); }
    const done = () => { pc.close(); resolve(found); };
    const timer = setTimeout(done, 5000);
    pc.onicecandidate = (e) => {
      if (!e.candidate) { clearTimeout(timer); return done(); }
      const { type, address } = e.candidate;
      if (!address) return;
      if (type === "srflx") found.open.add(address);
      else if (type === "host") { if (address.endsWith(".local")) found.hidden++; else found.local.add(address); }
    };
    pc.createDataChannel("probe");
    pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(reject);
  });
}

async function webrtc() {
  const [found, at] = await Promise.all([candidates(), seen || addresses().catch(() => ({ v4: "", v6: "" }))]);
  const known = [at.v4, at.v6].filter(Boolean);
  const open = [...found.open];
  const strays = open.filter((a) => !known.includes(a));
  const lines = [];
  if (!open.length) lines.push("No public address came back through WebRTC, so nothing leaks this way. It is blocked or limited in this browser, or the test couldn't reach its server.");
  else if (!known.length) lines.push(`WebRTC shows sites ${open.join(" and ")}. Run the connection check to compare it with the address the rest of your browsing uses.`);
  else if (!strays.length) lines.push(`WebRTC shows sites the same address as the rest of your connection (${open.join(" and ")}). No leak.`);
  else lines.push(`WebRTC shows sites a different address (${strays.join(" and ")}) from the one your connection uses (${known.join(" and ")}). On a VPN or proxy, that is your real address getting past it.`);
  if (found.local.size) lines.push(`Your address on the local network is visible to sites: ${[...found.local].join(", ")}.`);
  else if (found.hidden) lines.push("Your address on the local network is hidden behind a random name.");
  return lines.map((l, i) => el("p", i === 0 && strays.length ? "note bad" : "note", l));
}

// ---------- speed ----------
const mbps = (bytes, ms) => (bytes * 8) / (ms / 1000) / 1e6;
const rate = (n) => `${n >= 100 ? Math.round(n) : n.toFixed(1)} Mbps`;

// A quick reading over one connection: the delay of an empty request, then transfers that grow
// until one takes over a second, each way. It stops at 25 MB down and 5 MB up.
async function speed(say) {
  const pings = [];
  for (let i = 0; i < 6; i++) {
    const t0 = performance.now();
    await fetch(`${CF}/__down?bytes=0`, within(5000));
    pings.push(performance.now() - t0);
  }
  // The first one also opens the connection, so it is left out.
  const delay = pings.slice(1).sort((a, b) => a - b)[2];
  say("Measuring download…");
  let down;
  for (const bytes of [1e5, 1e6, 1e7, 2.5e7]) {
    const t0 = performance.now();
    const got = (await (await fetch(`${CF}/__down?bytes=${bytes}`, within(20000))).arrayBuffer()).byteLength;
    const ms = performance.now() - t0;
    down = mbps(got, ms);
    if (ms > 1000) break;
  }
  say("Measuring upload…");
  let up;
  for (const bytes of [1e5, 1e6, 5e6]) {
    const t0 = performance.now();
    const r = await fetch(`${CF}/__up`, { method: "POST", body: new Uint8Array(bytes), ...within(20000) });
    if (!r.ok) throw new Error(`Cloudflare answered ${r.status} to the upload`);
    const ms = performance.now() - t0;
    up = mbps(bytes, ms);
    if (ms > 1000) break;
  }
  return [
    facts([["Download", rate(down)], ["Upload", rate(up)], ["Delay", `${Math.round(delay)} ms`]]),
    el("p", "note", "A quick reading over one connection to the nearest Cloudflare site. A full test, linked below, uses several."),
  ];
}

// ---------- this browser ----------
function graphics() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return info ? text(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  } catch { return ""; } // no WebGL here: the row is left out
}

async function battery() {
  if (!navigator.getBattery) return "";
  const b = await navigator.getBattery().catch(() => null);
  return b ? `${Math.round(b.level * 100)}%${b.charging ? ", charging" : ""}` : "";
}

// Chrome's own guess at the connection, which sites can read too.
function network() {
  const c = navigator.connection;
  return c && c.effectiveType ? [c.effectiveType, c.downlink ? `about ${c.downlink} Mbps` : "", Number.isFinite(c.rtt) ? `${c.rtt} ms` : ""].filter(Boolean).join(", ") : "";
}

async function browser() {
  const ua = navigator.userAgentData;
  const more = ua ? await ua.getHighEntropyValues(["platformVersion", "architecture", "fullVersionList"]).catch(() => null) : null;
  const brand = ((more && more.fullVersionList) || (ua && ua.brands) || []).filter((b) => !/not.?a.?brand/i.test(b.brand)).sort((a, b) => (a.brand === "Chromium") - (b.brand === "Chromium"))[0];
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return facts([
    ["Browser", brand ? `${brand.brand} ${brand.version}` : navigator.userAgent],
    ["System", ua ? [ua.platform, more && more.platformVersion, more && more.architecture].filter(Boolean).join(" ") : navigator.platform],
    ["Time zone", zone],
    ["Languages", navigator.languages.join(", ")],
    ["Screen", `${screen.width} × ${screen.height}, ${devicePixelRatio}× pixels`],
    ["Graphics", graphics()],
    ["Processor threads", text(navigator.hardwareConcurrency)],
    ["Memory", navigator.deviceMemory ? `${navigator.deviceMemory} GB or more` : ""],
    ["Battery", await battery()],
    ["Network, by Chrome's guess", network()],
    ["Do Not Track", navigator.doNotTrack === "1" ? "sent" : "not sent"],
    ["Global Privacy Control", navigator.globalPrivacyControl ? "sent" : "not sent"],
  ].filter(([, v]) => v));
}

// ---------- links ----------
// Chrome's own pages can't be linked to; a button marked data-go sends this tab to one.
const CHROME = [
  ["Privacy and security", "chrome://settings/privacy"],
  ["Safe Browsing and secure DNS", "chrome://settings/security"],
  ["Third-party cookies", "chrome://settings/cookies"],
  ["Site permissions", "chrome://settings/content"],
  ["Location for sites", "chrome://settings/content/location"],
  ["Delete browsing data", "chrome://settings/clearBrowserData"],
  ["Extensions", "chrome://extensions/"],
  ["Sync", "chrome://settings/syncSetup"],
  ["DNS cache", "chrome://net-internals/#dns"],
  ["Version and paths", "chrome://version/"],
];

// Where macOS decides whether Chrome may know where the computer is: the switch behind "Use
// this computer's location". Chrome asks before it hands a link like this to another app.
const MAC = /Mac/.test(navigator.userAgent);
const MAC_LOCATION = "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices";

// Tests that need a site with servers of its own. Each name's title says what it is for.
const DEEPER = {
  "Your fingerprint": [
    ["Cover Your Tracks", "https://coveryourtracks.eff.org/", "How unique this browser is, from the Electronic Frontier Foundation"],
    ["Am I Unique", "https://amiunique.org/", "Your fingerprint against everyone else's"],
    ["CreepJS", "https://abrahamjuliot.github.io/creepjs/", "What a determined script can work out, and whether you are hiding anything"],
    ["Pixelscan", "https://pixelscan.net/", "Whether the fingerprint holds together, as a site that hunts bots would see it"],
    ["iphey", "https://iphey.com/", "How trustworthy the browser and its address look to a site"],
  ],
  "This device": [
    ["Device Info", "https://www.deviceinfo.me/", "Everything the device and browser report"],
    ["BrowserLeaks", "https://browserleaks.com/", "Every leak, one test at a time"],
  ],
  "Leaks and speed": [
    ["IPLeak", "https://ipleak.net/", "Addresses, DNS and torrent leaks on one page"],
    ["Mullvad check", "https://mullvad.net/en/check", "Whether you are on Mullvad, with its DNS and WebRTC checks"],
    ["DNS leak test", "https://www.dnsleaktest.com/", "Which resolvers see your lookups"],
    ["Cloudflare speed test", "https://speed.cloudflare.com/", "A full speed test over several connections"],
  ],
};

function linkCards() {
  const settings = card("Chrome's settings", "The pages where these things are changed.");
  const list = el("div", "golinks");
  for (const [label, url] of CHROME) {
    const b = el("button", "chip", `${label} ↗`);
    b.type = "button";
    b.dataset.go = url;
    list.append(b);
  }
  if (MAC) {
    const a = el("a", "chip", "Location Services on this Mac ↗");
    a.href = MAC_LOCATION;
    a.title = "Opens System Settings, where Chrome is allowed to know where this computer is";
    list.append(a);
  }
  settings.append(list);
  const deeper = card("Deeper tests", "These need a test site with servers of its own, so they are links.");
  for (const [group, links] of Object.entries(DEEPER)) {
    const row = el("div", "golinks");
    for (const [label, url, what] of links) {
      const a = el("a", "chip", label);
      a.href = url;
      a.title = what;
      row.append(a);
    }
    deeper.append(el("h3", null, group), row);
  }
  return [settings, deeper];
}

// Built once, so a result stays on the page while the tab is open.
let built = false;
export async function renderTools(root) {
  if (built) return;
  built = true;
  const about = card("This browser", "What any site can read without asking. Together it is most of a fingerprint.");
  about.append(await browser());
  root.replaceChildren(
    check("Connection", "The address the internet sees you at, and where that is. Asks Cloudflare.", "Check", connection),
    check("WebRTC", "Whether video-call plumbing shows sites an address your VPN or proxy was meant to hide. Asks Cloudflare's and Google's STUN servers.", "Check", webrtc),
    check("Speed", "Download, upload and delay, to Cloudflare. Uses up to 40 MB of data.", "Run", speed),
    about,
    ...linkCards(),
  );
}
