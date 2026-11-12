// The Tools page: how this connection and this browser look from outside, worked out here
// and drawn here. Nothing reaches the network until a button is pressed. "Check" asks ipleak.net
// (run by AirVPN, keyless, documented on its own page) for the address the internet sees, and
// for which DNS servers answered a lookup made for the purpose; it asks two STUN servers what
// WebRTC would show a site. "Run" measures speed against Cloudflare. The fingerprint is
// computed on this computer and goes nowhere. Chrome's own privacy switches are read through
// chrome.privacy, a permission asked for when its card is first opened.
// https://ipleak.net/ (API section, checked 2026-11-12)
import { el } from "./dom.js";
import { getPlace, offsetOf } from "./place.js";

const CF = "https://speed.cloudflare.com";
const within = (ms) => ({ cache: "no-store", signal: AbortSignal.timeout(ms) });
const str = (v) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};
// A country's flag from its two-letter code, or nothing.
const flag = (code) => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");
const many = (n, one, more = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : more}`;

// ---------- small parts ----------
function card(title, note, cls = "") {
  const box = el("article", `sc-card tool ${cls}`.trim());
  box.append(el("h2", null, title));
  if (note) box.append(el("p", "sc-note lead", note));
  return box;
}

// A list of name and value. A value is text, or nodes (a link, a button beside the text).
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
  return b;
}

// One line of a verdict: a dot that is good, a warning, bad or plain, then what it means.
function verdict(kind, text) {
  const p = el("p", `verdict ${kind}`);
  p.append(el("i"), el("span", null, text));
  return p;
}

// ---------- the address ----------
// ipleak.net's answer about an address: its own for the family asked, or one looked up.
const placed = (d) => ({
  ip: str(d.ip), city: str(d.city_name), region: str(d.region_name),
  country: str(d.country_name) || str(d.registered_country_name), code: str(d.country_code) || str(d.registered_country_code),
  isp: str(d.isp_name), as: num(d.as_number), zone: str(d.time_zone), lat: num(d.latitude), lon: num(d.longitude),
});
async function ask(url, ms = 8000) {
  const r = await fetch(url, within(ms));
  if (!r.ok) throw new Error(`ipleak.net answered ${r.status}`);
  return r.json();
}
// The address one family of the internet sees this computer at. A network without IPv6 has no
// second one, which is not a failure.
async function addressOf(family) {
  const at = placed(await ask(`https://${family}.ipleak.net/json/`, 6000));
  if (!at.ip) throw new Error("ipleak.net sent no address");
  return at;
}
const nameOf = (at) => [at.city, at.region === at.city ? "" : at.region, at.country].filter(Boolean).join(", ") || "an unknown place";

function kmBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const far = (km) => `${(Math.round(km / 10) * 10).toLocaleString()} km (${(Math.round(km / 16.09) * 10).toLocaleString()} mi)`;

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

// ---------- DNS ----------
// Whose servers answer this computer's lookups. A name nobody has asked for before is looked up
// four times; ipleak.net's own name servers note who came asking, and say. Its session is forty
// digits. Each server is then named, and they are counted by who runs them.
const digits = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b % 10).join("");
async function resolvers() {
  const session = digits(40);
  let seen = {};
  for (let i = 0; i < 4; i++) {
    const d = await ask(`https://${session}-${digits(8)}.ipleak.net/dnsdetection/`);
    if (d && d.ip && typeof d.ip === "object") seen = d.ip;
  }
  const ips = Object.keys(seen).slice(0, 12);
  const who = await Promise.all(ips.map((ip) => ask(`https://ipleak.net/json/${ip}`).then(placed).catch(() => ({ ip, isp: "", country: "", code: "" }))));
  const groups = new Map();
  for (const w of who) {
    const key = `${w.isp}|${w.country}`;
    const g = groups.get(key) || { isp: w.isp || "An unnamed network", country: w.country, code: w.code, n: 0 };
    g.n++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.n - a.n);
}

// ---------- the check: address, WebRTC and DNS together, since each explains the others ----------
async function check(say) {
  const [v4, v6, rtc, place] = await Promise.all([
    addressOf("ipv4").catch(() => null), addressOf("ipv6").catch(() => null),
    candidates().catch((err) => { console.warn("webrtc:", err.message); return null; }), getPlace(),
  ]);
  const at = v4 || v6;
  if (!at) throw new Error("ipleak.net couldn't be reached");
  say("Looking for the servers that answer your lookups…");
  const dns = await resolvers().catch((err) => { console.warn("dns:", err.message); return null; });
  return { v4, v6, at, rtc, place, dns };
}

// Where you are set to be, an arc, and where your traffic comes out.
function hop(place, at) {
  const km = place && at.lat !== null && at.lon !== null ? kmBetween(place, { lat: at.lat, lon: at.lon }) : null;
  const near = km !== null && km <= 150;
  const fig = el("figure", "hop");
  const art = svg("svg", { viewBox: "0 0 320 62", role: "img", "aria-label": km === null ? "Where your traffic comes out" : `Your traffic comes out ${far(km)} from your place` });
  const x = near ? 190 : 296;
  if (km !== null) {
    art.append(svg("path", { class: "hop-arc", d: `M24 46 Q${(24 + x) / 2} ${near ? 26 : -8} ${x} 46` }), svg("circle", { class: "hop-you", cx: 24, cy: 46, r: 6 }));
    art.append(svg("text", { class: "hop-far", x: (24 + x) / 2, y: near ? 22 : 16, "text-anchor": "middle" }, near ? "near" : far(km).split(" (")[0]));
  }
  art.append(svg("circle", { class: near || km === null ? "hop-exit" : "hop-exit away", cx: km === null ? 296 : x, cy: 46, r: 6 }));
  const ends = el("figcaption");
  ends.append(el("span", null, km === null ? "" : `📍 ${place.name || "Your place"}`), el("span", null, `${nameOf(at)} ${flag(at.code)}`.trim()));
  fig.append(art, ends);
  return { fig, km, near };
}

// What the check found, as four plain verdicts and two cards of detail.
function drawCheck({ v4, v6, at, rtc, place, dns }) {
  const { fig, km, near } = hop(place, at);
  const known = [v4 && v4.ip, v6 && v6.ip].filter(Boolean);

  // the address
  const who = [at.isp, at.as ? `AS${at.as}` : ""].filter(Boolean).join(" · ");
  const hero = el("p", "big-fact");
  hero.append(el("code", null, at.ip), copyable(at.ip));
  const address = [hero, fig, facts([
    ["Comes out in", nameOf(at)],
    ["Network", who || "unknown"],
    ["IPv4", v4 ? v4.ip : "none"],
    ["IPv6", v6 ? [el("code", null, v6.ip), " ", copyable(v6.ip)] : "none on this network"],
  ])];
  const away = km === null ? ["plain", place ? "Its distance from your place isn't known." : "Set a place on Today and this says how far the exit is from you."]
    : near ? ["plain", "Near your place. A VPN that comes out near you looks the same as none."]
      : ["plain", `${far(km)} from your place, so a VPN or proxy is in the way.`];
  address.push(verdict(...away));

  // the clock: a site reads your time zone, and compares it with where your address is
  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const there = at.zone ? offsetOf(at.zone) : null;
  const clock = there === null ? ["plain", "The address has no time zone on record to compare your clock with."]
    : there === -new Date().getTimezoneOffset() ? ["good", `Your clock (${mine}) agrees with where your address is.`]
      : ["warn", `Your clock says ${mine}; your address says ${at.zone}. A site can tell the two don't match.`];
  address.push(verdict(...clock));

  // WebRTC
  const leaks = [];
  let rtcTile;
  if (!rtc) { rtcTile = ["plain", "Couldn't run"]; leaks.push(verdict("plain", "The WebRTC check couldn't run in this browser.")); }
  else {
    const open = [...rtc.open];
    const strays = open.filter((a) => !known.includes(a));
    if (!open.length) { rtcTile = ["good", "Nothing shown"]; leaks.push(verdict("good", "No public address came back through WebRTC: it is blocked or limited here, or the test server couldn't be reached.")); }
    else if (strays.length) { rtcTile = ["bad", "Shows another address"]; leaks.push(verdict("bad", `WebRTC shows sites ${strays.join(" and ")}, not the address your browsing uses. On a VPN or proxy, that is your real address getting past it.`)); }
    else { rtcTile = ["good", "No leak"]; leaks.push(verdict("good", `WebRTC shows sites the same address as your browsing (${open.join(" and ")}).`)); }
    if (rtc.local.size) leaks.push(verdict("warn", `Your address on the local network is visible to sites: ${[...rtc.local].join(", ")}.`));
    else if (rtc.hidden) leaks.push(verdict("good", "Your address on the local network is hidden behind a random name."));
  }

  // DNS
  const lookups = [];
  let dnsTile;
  if (!dns || !dns.length) { dnsTile = ["plain", "Couldn't see"]; lookups.push(verdict("plain", "The servers that answer your lookups couldn't be seen this time.")); }
  else {
    const list = el("ul", "resolvers");
    for (const g of dns) {
      const li = el("li");
      li.append(el("span", "fl", flag(g.code) || "🌐"), el("b", null, g.isp), el("span", "cap", [g.country, many(g.n, "server")].filter(Boolean).join(" · ")));
      list.append(li);
    }
    lookups.push(list);
    const lands = [...new Set(dns.map((g) => g.country).filter(Boolean))];
    const same = lands.length > 0 && lands.every((c) => c === at.country);
    const own = dns.every((g) => at.isp && g.isp === at.isp);
    const kind = own || same ? "good" : lands.length ? "warn" : "plain";
    dnsTile = [kind, dns[0].isp];
    lookups.push(verdict(kind,
      own ? "Your lookups are answered by the same network your traffic comes out of."
        : same ? `Your lookups are answered in ${at.country}, where your traffic comes out. Whoever runs these servers sees every name you look up.`
          : lands.length ? `Your lookups are answered in ${lands.join(" and ")}, not in ${at.country || "the country"} where your traffic comes out. On a VPN, that means they are going around it.`
            : "Whoever runs these servers sees every name you look up."));
  }

  const tiles = el("div", "verdicts");
  const tile = (name, [kind, text], sub) => {
    const t = el("div", `tile-v ${kind}`);
    t.append(el("span", "cap", name), el("b", null, text), el("span", "cap", sub || ""));
    return t;
  };
  tiles.append(
    tile("Address", ["plain", `${at.city || at.country || at.ip} ${flag(at.code)}`.trim()], km === null ? who : near ? "near your place" : `${far(km).split(" (")[0]} from your place`),
    tile("Clock", [clock[0], clock[0] === "warn" ? "Doesn't match" : clock[0] === "good" ? "Matches" : "Unknown"], clock[0] === "warn" ? at.zone : mine),
    tile("WebRTC", rtcTile, rtc && rtc.hidden && !rtc.local.size ? "local address hidden" : ""),
    tile("DNS", dnsTile, dns && dns.length ? [...new Set(dns.map((g) => g.country).filter(Boolean))].join(", ") : ""),
  );
  return { tiles, address, leaks: [el("h3", null, "WebRTC"), ...leaks, el("h3", null, "DNS"), ...lookups] };
}

// ---------- speed ----------
const mbps = (bytes, ms) => (bytes * 8) / (ms / 1000) / 1e6;
const rate = (n) => (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1));
// A bar on a scale where each step is ten times the last, from 1 Mbps to 1,000.
const reach = (n) => `${Math.max(2, Math.min(100, (Math.log10(Math.max(n, 1)) / 3) * 100))}%`;

function meter(name, unit) {
  const box = el("div", "meter");
  const val = el("b", null, "–");
  const fill = el("i");
  const bar = el("div", "m-bar");
  bar.append(fill);
  const head = el("div", "m-head");
  head.append(el("span", "m-name", name), val, el("span", "cap", unit));
  box.append(head, bar);
  return { box, set: (n) => { val.textContent = rate(n); fill.style.width = reach(n); } };
}

// A quick reading over one connection: the delay of an empty request, then transfers that grow
// until one takes over a second, each way. It stops at 25 MB down and 5 MB up. Every transfer
// moves its bar, so the reading can be watched settling.
async function speed(say, down, up) {
  const pings = [];
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    await fetch(`${CF}/__down?bytes=0`, within(5000));
    pings.push(performance.now() - t0);
  }
  // The first one also opens the connection, so it is left out.
  const rest = pings.slice(1).sort((a, b) => a - b);
  say("Measuring download…");
  for (const bytes of [1e5, 1e6, 1e7, 2.5e7]) {
    const t0 = performance.now();
    const got = (await (await fetch(`${CF}/__down?bytes=${bytes}`, within(20000))).arrayBuffer()).byteLength;
    const ms = performance.now() - t0;
    down.set(mbps(got, ms));
    if (ms > 1000) break;
  }
  say("Measuring upload…");
  for (const bytes of [1e5, 1e6, 5e6]) {
    const t0 = performance.now();
    const r = await fetch(`${CF}/__up`, { method: "POST", body: new Uint8Array(bytes), ...within(20000) });
    if (!r.ok) throw new Error(`Cloudflare answered ${r.status} to the upload`);
    const ms = performance.now() - t0;
    up.set(mbps(bytes, ms));
    if (ms > 1000) break;
  }
  return { delay: rest[Math.floor(rest.length / 2)], spread: rest.at(-1) - rest[0] };
}

function speedCard() {
  const box = card("Speed", "Download, upload and delay, measured to Cloudflare. Uses up to 40 MB of data.");
  const down = meter("Download", "Mbps"), up = meter("Upload", "Mbps");
  const scale = el("div", "m-scale");
  scale.append(...["1", "10", "100", "1,000 Mbps"].map((t) => el("span", null, t)));
  const delay = el("p", "note");
  delay.setAttribute("role", "status");
  const go = el("button", "btn", "Run");
  go.type = "button";
  go.onclick = async () => {
    go.disabled = true;
    delay.textContent = "Measuring the delay…";
    try {
      const d = await speed((t) => { delay.textContent = t; }, down, up);
      delay.textContent = `Delay ${Math.round(d.delay)} ms, give or take ${Math.round(d.spread / 2)}. A quick reading over one connection.`;
    } catch (err) { console.warn("speed:", err.message); delay.textContent = `That didn't work: ${err.message}.`; }
    go.disabled = false;
    go.textContent = "Run again";
  };
  box.append(go, down.box, up.box, scale, delay);
  return box;
}

// ---------- fingerprint ----------
const hex = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");

// A drawing that comes out a little differently on every graphics stack.
function canvasInk() {
  const c = document.createElement("canvas");
  c.width = 240; c.height = 60;
  const g = c.getContext("2d");
  if (!g) return "";
  g.textBaseline = "alphabetic";
  const fade = g.createLinearGradient(0, 0, 240, 0);
  fade.addColorStop(0, "#f60"); fade.addColorStop(1, "#069");
  g.fillStyle = fade; g.fillRect(0, 0, 240, 60);
  g.fillStyle = "rgba(20, 40, 60, 0.7)"; g.font = "18px Arial"; g.fillText("New Tab, 0123 😃 — ffi", 6, 26);
  g.strokeStyle = "#fff"; g.beginPath(); g.arc(200, 34, 18, 0, Math.PI * 1.7); g.stroke();
  return c.toDataURL();
}

function graphics() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return info ? str(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  } catch { return ""; } // no WebGL here: the row is left out
}

// A tone put through a compressor adds up differently on every audio stack.
async function audioSum() {
  const Ctx = globalThis.OfflineAudioContext;
  if (!Ctx) return "";
  try {
    const ctx = new Ctx(1, 5000, 44100);
    const osc = ctx.createOscillator();
    osc.type = "triangle"; osc.frequency.value = 10000;
    const comp = ctx.createDynamicsCompressor();
    osc.connect(comp); comp.connect(ctx.destination); osc.start(0);
    const data = (await ctx.startRendering()).getChannelData(0);
    let sum = 0;
    for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
    return sum.toFixed(8);
  } catch { return ""; } // audio is off here: the row is left out
}

// Which of these common fonts are installed, told by whether text set in one is a different
// width from the fallback.
const FONTS = ["Arial Black", "Arial Narrow", "Avenir", "Baskerville", "Calibri", "Cambria", "Candara", "Century Gothic", "Comic Sans MS", "Consolas", "DejaVu Sans", "Fira Code", "Futura", "Geneva", "Georgia", "Gill Sans", "Helvetica Neue", "Impact", "Inter", "JetBrains Mono", "Lucida Console", "Lucida Grande", "Menlo", "Monaco", "Noto Sans", "Optima", "Palatino", "Roboto", "Segoe UI", "SF Pro", "Tahoma", "Trebuchet MS", "Ubuntu", "Verdana"];
function fonts() {
  const g = document.createElement("canvas").getContext("2d");
  if (!g) return [];
  const width = (family) => { g.font = `72px ${family}`; return g.measureText("mmmmmmmmmmlli").width; };
  const bases = ["monospace", "serif"].map((b) => [b, width(b)]);
  return FONTS.filter((f) => bases.some(([b, w]) => width(`"${f}", ${b}`) !== w));
}

const voices = () => new Promise((resolve) => {
  const synth = globalThis.speechSynthesis;
  if (!synth) return resolve(0);
  const now = synth.getVoices().length;
  if (now) return resolve(now);
  // The list arrives late the first time it is asked for.
  const timer = setTimeout(() => resolve(synth.getVoices().length), 600);
  synth.onvoiceschanged = () => { clearTimeout(timer); resolve(synth.getVoices().length); };
});

async function battery() {
  if (!navigator.getBattery) return "";
  const b = await navigator.getBattery().catch(() => null);
  return b ? `${Math.round(b.level * 100)}%${b.charging ? ", charging" : ""}` : "";
}

// Everything a script can read here without asking, each with how far it narrows down who you
// are (3 a lot, 2 some, 1 a little) and whether it stays the same from visit to visit. The
// ones that stay the same make the fingerprint.
async function signals() {
  const ua = navigator.userAgentData;
  const more = ua ? await ua.getHighEntropyValues(["platformVersion", "architecture", "fullVersionList"]).catch(() => null) : null;
  const brand = ((more && more.fullVersionList) || (ua && ua.brands) || []).filter((b) => !/not.?a.?brand/i.test(b.brand)).sort((a, b) => (a.brand === "Chromium") - (b.brand === "Chromium"))[0];
  const [ink, sound, heard, charge] = await Promise.all([hex(canvasInk()), audioSum(), voices(), battery()]);
  const have = fonts();
  const c = navigator.connection;
  return [
    ["Canvas drawing", ink.slice(0, 12), 3, true, "The same picture, drawn by your graphics stack, comes out a little differently from most other people's."],
    ["Graphics card", graphics(), 3, true],
    ["Audio processing", sound ? (await hex(sound)).slice(0, 12) : "", 3, true, "A tone put through your audio stack adds up to a number of its own."],
    ["Fonts installed", have.length ? `${have.length} of ${FONTS.length} tested` : "", 3, true, have.join(", ")],
    ["System voices", heard ? String(heard) : "", 2, true],
    ["Browser", brand ? `${brand.brand} ${brand.version}` : navigator.userAgent, 2, true],
    ["System", ua ? [ua.platform, more && more.platformVersion, more && more.architecture].filter(Boolean).join(" ") : navigator.platform, 2, true],
    ["Screen", `${screen.width} × ${screen.height}, ${devicePixelRatio}× pixels, ${screen.colorDepth}-bit`, 2, true],
    ["Processor and memory", [navigator.hardwareConcurrency ? many(navigator.hardwareConcurrency, "thread") : "", navigator.deviceMemory ? `${navigator.deviceMemory} GB or more` : ""].filter(Boolean).join(", "), 2, true],
    ["Time zone", Intl.DateTimeFormat().resolvedOptions().timeZone, 1, true],
    ["Languages", navigator.languages.join(", "), 1, true],
    ["Do Not Track", navigator.doNotTrack === "1" ? "sent" : "not sent", 1, true],
    ["Global Privacy Control", navigator.globalPrivacyControl ? "sent" : "not sent", 1, true],
    ["Battery", charge, 1, false],
    ["Network, by Chrome's guess", c && c.effectiveType ? [c.effectiveType, c.downlink ? `about ${c.downlink} Mbps` : ""].filter(Boolean).join(", ") : "", 1, false],
  ].filter(([, value]) => value);
}

async function fingerprintCard() {
  const box = card("Fingerprint", "", "wide");
  const all = await signals();
  const steady = all.filter(([, , , keeps]) => keeps);
  const id = (await hex(JSON.stringify(steady.map(([name, value]) => [name, value])))).slice(0, 8);
  const hero = el("p", "big-fact");
  hero.append(el("code", null, `${id.slice(0, 4)}-${id.slice(4)}`));
  hero.firstChild.id = "fpId";
  const table = el("div", "signals");
  for (const [name, value, weight, keeps, why] of all) {
    const dots = el("span", "dots");
    dots.title = ["", "Narrows you down a little", "Narrows you down some", "Narrows you down a lot"][weight];
    dots.setAttribute("aria-label", dots.title);
    for (let i = 1; i <= 3; i++) dots.append(el("i", i <= weight ? "on" : ""));
    const val = el("span", "s-val", value);
    val.title = why || value;
    const row = el("div", "sig");
    row.append(el("span", keeps ? "s-name" : "s-name loose", name), val, dots);
    table.append(row);
  }
  const wider = el("p", "sc-note");
  const eff = el("a", null, "Cover Your Tracks");
  eff.href = "https://coveryourtracks.eff.org/";
  const ami = el("a", null, "Am I Unique");
  ami.href = "https://amiunique.org/";
  wider.append("How rare this combination is can only be measured against a great many other browsers, which a page can't do alone: ", eff, " and ", ami, " have that sample.");
  box.append(
    hero,
    el("p", "sc-note", `Worked out on this computer, from the ${steady.length} things below that stay the same, the way a tracking script does it. No cookie is needed, so clearing them doesn't change it. It is sent nowhere.`),
    table, wider,
  );
  return box;
}

// ---------- Chrome's privacy switches ----------
// Each switch Chrome lets an extension read: where it lives in chrome.privacy, what it means,
// which way is the private one, and the Chrome page where it is changed. `null` for the private
// way means there isn't one to prefer.
const SWITCHES = [
  ["websites", "thirdPartyCookiesAllowed", "Third-party cookies", "Allowed", "Blocked", false, "chrome://settings/cookies", "Cookies from sites other than the one you are on, which is how you are followed between sites."],
  ["services", "safeBrowsingEnabled", "Safe Browsing", "On", "Off", true, "chrome://settings/security", "Warns before a dangerous site or download."],
  ["websites", "topicsEnabled", "Ad topics", "On", "Off", false, "chrome://settings/adPrivacy", "Chrome works out your interests from your history and tells sites."],
  ["websites", "fledgeEnabled", "Site-suggested ads", "On", "Off", false, "chrome://settings/adPrivacy", "Sites you visit can pick ads to show you elsewhere."],
  ["websites", "adMeasurementEnabled", "Ad measurement", "On", "Off", false, "chrome://settings/adPrivacy", "Sites and advertisers measure how their ads did, using your browser."],
  ["network", "networkPredictionEnabled", "Preload pages", "On", "Off", false, "chrome://settings/performance", "Chrome opens pages it guesses you will visit; those sites see you arrive before you click."],
  ["services", "searchSuggestEnabled", "Search suggestions", "On", "Off", false, "chrome://settings/syncSetup", "What you type in the address bar goes to your search engine as you type."],
  ["websites", "doNotTrackEnabled", "Do Not Track request", "Sent", "Not sent", true, "chrome://settings/cookies", "Asks sites not to track you. Most ignore it."],
  ["services", "passwordSavingEnabled", "Offer to save passwords", "On", "Off", null, "chrome://password-manager/settings", "Off is right if a password manager does this for you."],
];
// WebRTC's route has no switch in Chrome's settings; an extension is the only way to set it.
const ROUTES = [
  ["default", "Any route (Chrome's default)"],
  ["default_public_interface_only", "Only the route your browsing takes"],
  ["disable_non_proxied_udp", "Only through a proxy, or not at all"],
];
const ASK = { permissions: ["privacy"] };

async function privacyCard(box = card("Chrome's privacy switches", "", "wide")) {
  const body = [];
  if (!(await chrome.permissions.contains(ASK))) {
    const go = el("button", "btn", "Show them");
    go.type = "button";
    // Chrome only shows its permission prompt straight from a click.
    go.onclick = async () => { if (await chrome.permissions.request(ASK)) privacyCard(box); };
    body.push(el("p", "sc-note", "How Chrome itself is set, read from Chrome and shown here with which way is the private one. Chrome will ask to let this page “change your privacy-related settings”; it changes one, and only when you choose to: the route WebRTC takes, which has no switch in Chrome."), go);
  } else {
    const rows = [];
    let good = 0, judged = 0;
    for (const [area, key, name, on, off, wanted, page, why] of SWITCHES) {
      const setting = chrome.privacy[area] && chrome.privacy[area][key];
      if (!setting) continue; // a Chrome without this switch
      const { value } = await setting.get({});
      const kind = wanted === null ? "plain" : value === wanted ? "good" : "warn";
      if (wanted !== null) { judged++; if (value === wanted) good++; }
      const state = el("span", `state ${kind}`, value ? on : off);
      const change = el("button", "mini", "Change ↗");
      change.type = "button";
      change.dataset.go = page;
      change.setAttribute("aria-label", `Change ${name} in Chrome`);
      const what = el("span", "sw-name");
      what.append(el("b", null, name), el("span", "cap", why));
      const row = el("div", "sw");
      row.append(what, state, change);
      rows.push(row);
    }
    const score = el("div", "score");
    score.setAttribute("role", "img");
    score.setAttribute("aria-label", `${good} of ${judged} set the private way`);
    for (let i = 0; i < judged; i++) score.append(el("i", i < good ? "on" : ""));
    const list = el("div", "switches");
    list.append(...rows);

    const route = chrome.privacy.network.webRTCIPHandlingPolicy;
    const now = await route.get({});
    const pick = el("select");
    pick.id = "rtcRoute";
    pick.setAttribute("aria-label", "The route WebRTC may take");
    for (const [value, label] of ROUTES) { const o = el("option", null, label); o.value = value; pick.append(o); }
    pick.value = ROUTES.some(([v]) => v === now.value) ? now.value : "default";
    const mine = /this_extension/.test(now.levelOfControl);
    pick.disabled = !mine;
    pick.onchange = async () => {
      // Chrome's default is handed back by letting go of the setting, not by setting it.
      if (pick.value === "default") await route.clear({}); else await route.set({ value: pick.value });
      privacyCard(box);
    };
    const rtc = el("div", "sw-route");
    const label = el("span", "sw-name");
    label.append(el("b", null, "WebRTC route"), el("span", "cap", mine
      ? "Which way video-call traffic may go. Narrowing it stops WebRTC showing sites an address your VPN or proxy hides, and can break calls on some networks. Chrome has no switch for this; while it is set here, this extension holds it."
      : "Set by another extension or by your organization, so it can't be changed here."));
    rtc.append(label, pick);
    body.push(el("p", "big-fact small", `${good} of ${judged} set the private way`), score, list, rtc);
  }
  box.replaceChildren(el("h2", null, "Chrome's privacy switches"), ...body);
  return box;
}

// ---------- the page ----------
// Built once, so a result stays on the page while the tab is open.
let built = false;
export async function renderTools(root) {
  if (built) return;
  built = true;
  const tiles = el("div", "verdicts-slot");
  const address = card("Where you come out", "The address the internet sees you at, where that is, and whether your clock agrees.");
  const leaks = card("Leaks", "What WebRTC would show a site, and whose servers answer your lookups.");
  const addressOut = el("div", "out"), leaksOut = el("div", "out");
  address.append(addressOut);
  leaks.append(leaksOut);
  const go = el("button", "btn primary", "Check");
  go.type = "button";
  const status = el("span", "cap");
  status.setAttribute("role", "status");
  status.textContent = "Asks ipleak.net for your address and DNS servers, and two STUN servers for WebRTC. Nothing is kept.";
  go.onclick = async () => {
    go.disabled = true;
    status.textContent = "Checking your address and WebRTC…";
    try {
      const found = drawCheck(await check((t) => { status.textContent = t; }));
      tiles.replaceChildren(found.tiles);
      addressOut.replaceChildren(...found.address);
      leaksOut.replaceChildren(...found.leaks);
      status.textContent = `Checked at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
    } catch (err) { console.warn("check:", err.message); status.textContent = `That didn't work: ${err.message}.`; }
    go.disabled = false;
    go.textContent = "Check again";
  };
  const start = el("div", "tl-start");
  start.append(go, status);
  const grid = el("div", "tl-grid");
  grid.append(address, leaks, speedCard(), await fingerprintCard(), await privacyCard());
  root.replaceChildren(start, tiles, grid);
}
