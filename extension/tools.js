// The Tools page: how this connection and this browser look from outside, worked out here and
// drawn here. Opening the tab runs the check, since opening it is asking; no other part of the
// page makes these calls. The check asks ipleak.net (run by AirVPN, keyless, documented on its
// own page) for the address the internet sees and for which DNS servers answered a lookup made
// for the purpose, and asks two STUN servers what WebRTC would show a site. Speed waits for a
// press, because it spends data, and measures against Cloudflare. The fingerprint is computed
// on this computer and goes nowhere. Chrome's own privacy switches are read through
// chrome.privacy, a permission asked for when its card is first opened.
// https://ipleak.net/ (API section, checked 2026-11-12)
import { el } from "./dom.js";
import { getPlace, offsetOf } from "./place.js";
import { LAND } from "./land.js";

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
function card(title, cls = "") {
  const box = el("article", `sc-card tool ${cls}`.trim());
  box.append(el("h2", null, title));
  return box;
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

// A state is never colour alone: a mark with a sign in it, beside words in ordinary ink.
const SIGN = { good: "✓", warn: "!", bad: "✕" };
function mark(kind) {
  const i = el("i", `mk ${kind}`, SIGN[kind] || "");
  i.setAttribute("aria-hidden", "true");
  return i;
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
const cityOf = (at) => [at.city, at.country].filter(Boolean).join(", ") || "an unknown place";

function kmBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const far = (km) => `${(Math.round(km / 10) * 10).toLocaleString()} km`;

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
  say(at, place);
  const dns = await resolvers().catch((err) => { console.warn("dns:", err.message); return null; });
  return { v4, v6, at, rtc, place, dns };
}

// ---------- the map ----------
// The world as dots, six units to a cell, with north at the top and 180° west at the left.
const CELL = 6;
const MAP = { w: LAND.cols * CELL, h: LAND.rows * CELL };
const spot = ({ lat, lon }) => [((lon + 180) / 360) * MAP.w, ((LAND.top - lat) / (LAND.rows * LAND.step)) * MAP.h];
function land() {
  const bytes = Uint8Array.from(atob(LAND.bits), (c) => c.charCodeAt(0));
  let d = "";
  for (let i = 0; i < LAND.cols * LAND.rows; i++) {
    if ((bytes[i >> 3] >> (i & 7)) & 1) d += `M${(i % LAND.cols) * CELL + CELL / 2} ${Math.floor(i / LAND.cols) * CELL + CELL / 2}h0`;
  }
  return d;
}

// The shortest way round the globe from one place to another, as a path on the flat map. Where
// it leaves one edge and comes back at the other, the line breaks.
function route(a, b) {
  const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
  const [f1, l1, f2, l2] = [rad(a.lat), rad(a.lon), rad(b.lat), rad(b.lon)];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((f2 - f1) / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin((l2 - l1) / 2) ** 2));
  if (!d) return "";
  let path = "", last = null;
  for (let i = 0; i <= 64; i++) {
    const f = i / 64, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(f1) * Math.cos(l1) + B * Math.cos(f2) * Math.cos(l2);
    const y = A * Math.cos(f1) * Math.sin(l1) + B * Math.cos(f2) * Math.sin(l2);
    const z = A * Math.sin(f1) + B * Math.sin(f2);
    const [px, py] = spot({ lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) });
    path += `${last === null || Math.abs(px - last) > MAP.w / 2 ? "M" : "L"}${px.toFixed(1)} ${Math.max(2, py).toFixed(1)}`;
    last = px;
  }
  return path;
}

// A place on the map: a dot ringed in the surface colour so it reads over the land, and its
// name set on the side away from the other place, unless the edge of the map is in the way.
function pin(cls, at, name, note, other) {
  const [x, y] = spot(at);
  const g = svg("g", { class: `pin ${cls}` });
  g.append(svg("title", {}, note), svg("circle", { class: "halo", cx: x, cy: y, r: 11 }), svg("circle", { class: "dot", cx: x, cy: y, r: 5.5 }));
  const room = name.length * 7.5 + 14;
  const left = x > MAP.w - room || (other && spot(other)[0] > x && x > room);
  g.append(svg("text", { x: x + (left ? -11 : 11), y: y + 4, "text-anchor": left ? "end" : "start" }, name));
  return g;
}

function worldMap() {
  const art = svg("svg", { viewBox: `0 0 ${MAP.w} ${MAP.h}`, role: "img", "aria-label": "A map of the world" });
  const over = svg("g");
  art.append(svg("path", { class: "land", d: land() }), over);
  return {
    art,
    // Where you are set to be, where your traffic comes out, and the way between them.
    draw({ place, at }) {
      const out = at && at.lat !== null && at.lon !== null ? { lat: at.lat, lon: at.lon } : null;
      const km = place && out ? kmBetween(place, out) : null;
      const near = km !== null && km <= 150;
      const parts = [];
      if (km !== null && !near) parts.push(svg("path", { class: "route", d: route(place, out), pathLength: 1 }));
      if (place) parts.push(pin(near ? "you here" : "you", place, near ? cityOf(at) : (place.name || "You").split(",")[0], `${place.name || "The place this page is set to"}: where you are`, near ? null : out));
      if (out && !near) parts.push(pin("exit", out, at.city || at.country || "Exit", `${cityOf(at)}: where your traffic comes out`, place));
      over.replaceChildren(...parts);
      art.setAttribute("aria-label", km === null ? `Your traffic comes out in ${at ? cityOf(at) : "a place not yet known"}` : near ? `Your traffic comes out near your place, in ${cityOf(at)}` : `Your traffic comes out in ${cityOf(at)}, ${far(km)} from ${place.name || "your place"}`);
      return { km, near };
    },
  };
}

// ---------- what the check found, as one sentence, the map, and four answers ----------
function way(name, kind, say, why) {
  const box = el("div", `way ${kind}`);
  const head = el("p", "way-say");
  head.append(mark(kind), el("b", null, say));
  box.append(el("span", "way-name", name), head, ...[].concat(why).map((w) => (typeof w === "string" ? el("p", "way-why", w) : w)));
  return box;
}

// A thing to do about an answer, beside it. One that opens a page of Chrome's says so.
function act(label, run, go) {
  const b = el("button", "mini act", label);
  b.type = "button";
  if (go) b.dataset.go = go; else b.onclick = run;
  return b;
}

// A sign is kept for what matters and can be acted on. Red is your real address getting out.
// Amber is something going around a VPN that you can change. Green is a VPN doing what it is
// for. With nothing carrying you elsewhere (`away` false) these are plain facts, not verdicts,
// and so is anything you can't change from here, like the clock.
function answers({ v4, v6, at, rtc, dns }, away, limitWebrtc) {
  const known = [v4 && v4.ip, v6 && v6.ip].filter(Boolean);

  const network = way("Network", "plain", at.isp || "Unknown", [
    at.as ? `Its number on the internet is AS${at.as}.` : "",
    v6 ? `You also have an IPv6 address, ${v6.ip}.` : "No IPv6 address on this network.",
  ].filter(Boolean));

  // the clock: a site reads your time zone, and compares it with where your address is
  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const there = at.zone ? offsetOf(at.zone) : null;
  const clock = there === null ? way("Clock", "plain", "Can't compare", "The address has no time zone on record.")
    : there === -new Date().getTimezoneOffset() ? way("Clock", away ? "good" : "plain", "Matches", `Your clock (${mine}) agrees with where your address is.`)
      : way("Clock", "plain", "Differs from your address", `Your clock says ${mine}; your address says ${at.zone}. A site can tell you are not where your address is.`);

  let webrtc;
  if (!rtc) webrtc = way("WebRTC", "plain", "Couldn't run", "The check couldn't run in this browser.");
  else {
    const open = [...rtc.open];
    const strays = open.filter((a) => !known.includes(a));
    const local = rtc.local.size ? `Your address on the local network is visible to sites: ${[...rtc.local].join(", ")}.` : rtc.hidden ? "Your address on the local network is hidden behind a random name." : "";
    webrtc = !open.length ? way("WebRTC", away ? "good" : "plain", "Shows nothing", ["No public address came back: it is blocked or limited here.", local].filter(Boolean))
      : strays.length ? way("WebRTC", "bad", "Shows another address", [`Sites can see ${strays.join(" and ")} through it, not the address above. On a VPN, that is your real address getting past it.`, local].filter(Boolean))
        : way("WebRTC", away ? "good" : "plain", away ? "No leak" : "Same address", ["It shows sites the same address as your browsing.", local].filter(Boolean));
    // What WebRTC gives away can be narrowed from here: the one Chrome setting with no switch.
    if (strays.length || rtc.local.size) webrtc.append(act("Limit WebRTC to your browsing's route", limitWebrtc));
  }

  let lookups;
  if (!dns || !dns.length) lookups = way("DNS", "plain", "Couldn't see", "The servers that answer your lookups couldn't be seen this time.");
  else {
    const lands = [...new Set(dns.map((g) => g.country).filter(Boolean))];
    const same = lands.length > 0 && lands.every((c) => c === at.country);
    const own = dns.every((g) => at.isp && g.isp === at.isp);
    const kind = !away ? "plain" : own || same ? "good" : lands.length ? "warn" : "plain";
    const list = el("ul", "resolvers");
    for (const g of dns.slice(0, 3)) {
      const li = el("li");
      li.append(el("span", "fl", flag(g.code) || "🌐"), el("span", null, `${g.isp}, ${many(g.n, "server")}`));
      list.append(li);
    }
    lookups = way("DNS", kind, own ? "Your own network" : same ? `Answered in ${at.country}` : lands.length ? `Answered in ${lands[0]}` : dns[0].isp, [
      list,
      own ? "Lookups are answered by the network your traffic comes out of."
        : same ? "Lookups are answered where your traffic comes out. Whoever runs these servers sees every name you look up."
          : lands.length ? `Not in ${at.country || "the country"} where your traffic comes out. On a VPN, that means lookups are going around it.`
            : "Whoever runs these servers sees every name you look up.",
    ]);
    if (kind === "warn") lookups.append(act("Choose your DNS in Chrome", null, "chrome://settings/security"));
  }
  return [network, clock, webrtc, lookups];
}

function heroPanel() {
  const line = el("h2", "hero-line", "Finding where you come out…");
  line.id = "heroLine";
  const sub = el("p", "hero-sub", "Asking ipleak.net what address it sees, and two STUN servers what WebRTC would show.");
  const address = el("p", "hero-ip");
  const again = el("button", "btn", "Check again");
  again.type = "button";
  again.disabled = true;
  const say = el("div", "hero-say");
  say.append(line, sub, address, again);
  const map = worldMap();
  const world = el("figure", "world busy");
  world.append(map.art);
  const top = el("div", "hero-top");
  top.append(say, world);
  const ways = el("div", "ways");
  ways.setAttribute("role", "status");
  const box = el("section", "hero");
  box.append(top, ways);

  // The sentence and the map as soon as the address is known; the four answers when DNS is in.
  let away = false;
  const landed = (at, place) => {
    const { km, near } = map.draw({ place, at });
    away = km !== null && !near;
    line.textContent = `You come out in ${cityOf(at)}. ${flag(at.code)}`.trim();
    sub.textContent = km === null ? (place ? "How far that is from your place isn't known." : "Set a place on Today and this says how far that is from you.")
      : near ? "That is where you are, near enough. Nothing is carrying you elsewhere, or it comes out close by."
        : `That is ${far(km)} from ${place.name || "your place"}, so a VPN or proxy is carrying you.`;
    address.replaceChildren(el("code", null, at.ip), copyable(at.ip));
    world.classList.remove("busy");
    world.classList.add("landed");
  };
  // Narrowing WebRTC is a change to Chrome, so Chrome asks first; then the check runs again to
  // show what difference it made.
  const limitWebrtc = async () => {
    if (!(await chrome.permissions.request(ASK))) return;
    await chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: "default_public_interface_only" });
    if (privacyBox) privacyCard(privacyBox);
    run();
  };
  const run = async () => {
    again.disabled = true;
    world.classList.add("busy");
    world.classList.remove("landed");
    try {
      const found = await check((at, place) => { landed(at, place); ways.replaceChildren(el("p", "way-why", "Looking for the servers that answer your lookups…")); });
      ways.replaceChildren(...answers(found, away, limitWebrtc));
    } catch (err) {
      console.warn("check:", err.message);
      line.textContent = "Couldn't find where you come out.";
      sub.textContent = `${err.message[0].toUpperCase()}${err.message.slice(1)}. You may be offline, or something is blocking it.`;
      address.replaceChildren();
      ways.replaceChildren();
      world.classList.remove("busy");
    }
    again.disabled = false;
  };
  again.onclick = run;
  return { box, run };
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
  head.append(el("span", "m-name", name), val, el("span", "m-unit", unit));
  box.append(head, bar);
  return { box, set: (n) => { val.textContent = rate(n); fill.style.width = reach(n); box.title = `${name}: ${rate(n)} ${unit}`; } };
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
  const box = card("Speed");
  const down = meter("Download", "Mbps"), up = meter("Upload", "Mbps");
  const scale = el("div", "m-scale");
  scale.append(...["1", "10", "100", "1,000 Mbps"].map((t) => el("span", null, t)));
  const delay = el("p", "sc-note");
  delay.setAttribute("role", "status");
  delay.textContent = "Measured to Cloudflare when you press Run. It uses up to 40 MB of data, so it waits for you.";
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
  box.firstChild.append(go);
  box.append(down.box, up.box, scale, delay);
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

// The graphics card as a person would name it: Chrome reports it wrapped in the name of its
// own drawing layer, with codes after it.
function graphics() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl && gl.getExtension("WEBGL_debug_renderer_info");
    const raw = info ? str(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    const inner = /^ANGLE \([^,]+, (.+?)(?:, [^,]*)?\)$/.exec(raw);
    return (inner ? inner[1] : raw).replace(/ANGLE Metal Renderer: /, "").replace(/ \(0x[0-9a-f]+\)/gi, "").replace(/ Direct3D.*$/, "").replace(/\((R|TM)\)/g, "").trim();
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

const tongue = (code) => {
  try { return new Intl.DisplayNames([navigator.language], { type: "language" }).of(code) || code; } catch { return code; } // not a language code: show what was sent
};

// Everything a script can read here without asking, in plain words, with how far each narrows
// down who you are (3 a lot, 2 some, 1 a little; 0 for what changes from visit to visit and so
// is no use for knowing you again). `raw` is what is hashed; `value` is what is shown.
async function signals() {
  const ua = navigator.userAgentData;
  const more = ua ? await ua.getHighEntropyValues(["platformVersion", "architecture", "fullVersionList"]).catch(() => null) : null;
  const brand = ((more && more.fullVersionList) || (ua && ua.brands) || []).filter((b) => !/not.?a.?brand/i.test(b.brand)).sort((a, b) => (a.brand === "Chromium") - (b.brand === "Chromium"))[0];
  const [ink, sound, heard, charge] = await Promise.all([hex(canvasInk()), audioSum(), voices(), battery()]);
  const tone = sound ? await hex(sound) : "";
  const have = fonts();
  const c = navigator.connection;
  const system = ua ? [ua.platform, more && more.platformVersion && more.platformVersion.replace(/(\.0)+$/, ""), more && more.architecture && `on ${more.architecture}`].filter(Boolean).join(" ") : navigator.platform;
  return [
    { name: "How it draws", value: `a signature of its own, ${ink.slice(0, 6)}`, raw: ink, weight: 3, why: "The same picture, drawn by your graphics stack, comes out a little differently from most other people's." },
    { name: "Graphics", value: graphics(), weight: 3 },
    { name: "How it plays sound", value: tone ? `a signature of its own, ${tone.slice(0, 6)}` : "", raw: tone, weight: 3, why: "A tone put through your audio stack adds up to a number of its own." },
    { name: "Fonts", value: have.length ? `${have.length} of the ${FONTS.length} looked for` : "", raw: have.join(), weight: 3, why: have.join(", ") },
    { name: "Voices", value: heard ? `${heard} installed` : "", weight: 2 },
    { name: "Browser", value: brand ? `${brand.brand.replace(/^Google /, "")} ${brand.version.split(".")[0]}` : navigator.userAgent, raw: brand ? `${brand.brand} ${brand.version}` : navigator.userAgent, weight: 2, why: brand ? `${brand.brand} ${brand.version}` : "" },
    { name: "System", value: system, weight: 2 },
    { name: "Screen", value: `${screen.width} × ${screen.height}${devicePixelRatio > 1 ? ` at ${devicePixelRatio}×` : ""}`, raw: `${screen.width}x${screen.height}@${devicePixelRatio}/${screen.colorDepth}`, weight: 2 },
    { name: "Processor and memory", value: [navigator.hardwareConcurrency ? many(navigator.hardwareConcurrency, "thread") : "", navigator.deviceMemory ? `${navigator.deviceMemory} GB or more` : ""].filter(Boolean).join(", "), weight: 2 },
    { name: "Time zone", value: Intl.DateTimeFormat().resolvedOptions().timeZone, weight: 1 },
    { name: "Languages", value: navigator.languages.map(tongue).join(", "), raw: navigator.languages.join(), weight: 1 },
    { name: "Do Not Track", value: navigator.doNotTrack === "1" ? "sent" : "not sent", weight: 1 },
    { name: "Global Privacy Control", value: navigator.globalPrivacyControl ? "sent" : "not sent", weight: 1 },
    { name: "Battery", value: charge, weight: 0 },
    { name: "Network, by Chrome's guess", value: c && c.effectiveType ? [c.effectiveType, c.downlink ? `about ${c.downlink} Mbps` : ""].filter(Boolean).join(", ") : "", weight: 0 },
  ].filter((s) => s.value);
}

// The fingerprint drawn: seven broken rings whose gaps and turns come from its bytes, so the
// same browser always draws the same mark and another draws a different one.
function whorl(id) {
  const bytes = id.match(/../g).map((h) => parseInt(h, 16));
  const art = svg("svg", { viewBox: "0 0 120 120", class: "whorl", role: "img", "aria-label": "This browser's fingerprint, drawn" });
  for (let ring = 0; ring < 7; ring++) {
    const r = 9 + ring * 7.4, round = 2 * Math.PI * r, b = (i) => bytes[(ring * 4 + i) % bytes.length] / 255;
    const dashes = [0.2 + 0.28 * b(0), 0.05 + 0.08 * b(1), 0.14 + 0.2 * b(2), 0.04 + 0.07 * b(3)].map((f) => (f * round).toFixed(1)).join(" ");
    art.append(svg("circle", { cx: 60, cy: 60, r, "stroke-dasharray": dashes, transform: `rotate(${Math.round(b(1) * 360)} 60 60)` }));
  }
  return art;
}

const TIERS = [[3, "Narrows you down a lot"], [2, "Some"], [1, "A little"]];
async function fingerprintCard() {
  const box = card("Fingerprint", "wide2");
  const all = await signals();
  const steady = all.filter((s) => s.weight > 0);
  const id = await hex(JSON.stringify(steady.map((s) => [s.name, s.raw ?? s.value])));
  const code = el("code", null, `${id.slice(0, 4)}-${id.slice(4, 8)}`);
  code.id = "fpId";
  const seal = el("figure", "seal");
  seal.append(whorl(id), code);
  const say = el("div", "fp-say");
  say.append(
    el("p", "fp-line", "A site can know this browser again without a cookie."),
    el("p", "sc-note", `This mark is worked out on your computer from the ${steady.length} things below, the way a tracking script does it. Clearing cookies doesn't change it. It is sent nowhere.`),
  );
  const top = el("div", "fp-top");
  top.append(seal, say);
  const tiers = el("div", "tiers");
  for (const [weight, title] of TIERS) {
    const col = el("section", "tier");
    const list = el("dl");
    for (const s of steady.filter((x) => x.weight === weight)) {
      const dd = el("dd", null, s.value);
      dd.title = s.why || s.value;
      list.append(el("dt", null, s.name), dd);
    }
    col.append(el("h3", null, title), list);
    tiers.append(col);
  }
  const loose = all.filter((s) => s.weight === 0);
  const wider = el("p", "sc-note");
  const eff = el("a", null, "Cover Your Tracks");
  eff.href = "https://coveryourtracks.eff.org/";
  const ami = el("a", null, "Am I Unique");
  ami.href = "https://amiunique.org/";
  wider.append(loose.length ? `A site can also read your ${loose.map((s) => `${s.name.toLowerCase().replace(", by chrome's guess", "")} (${s.value})`).join(" and ")}, which change too often to know you by. ` : "", "How rare this mark is takes a great many other browsers to say: ", eff, " and ", ami, " have that sample.");
  box.append(top, tiers, wider);
  return box;
}

// ---------- Chrome's privacy switches ----------
// Each switch Chrome lets an extension read: where it lives in chrome.privacy, what it means,
// which way is the private one, and the Chrome page where it is changed. `null` for the private
// way means it is a trade you make, not a fault: it is shown without a verdict. The last item
// is how much it matters when set the other way: amber, or red for the one that protects you.
const SWITCHES = [
  ["services", "safeBrowsingEnabled", "Safe Browsing", "on", "off", true, "chrome://settings/security", "Warns before a dangerous site or download.", "bad"],
  ["websites", "thirdPartyCookiesAllowed", "Third-party cookies", "allowed", "blocked", false, "chrome://settings/cookies", "Cookies from sites other than the one you are on, which is how you are followed between sites."],
  ["websites", "topicsEnabled", "Ad topics", "on", "off", false, "chrome://settings/adPrivacy", "Chrome works out your interests from your history and tells sites."],
  ["websites", "fledgeEnabled", "Site-suggested ads", "on", "off", false, "chrome://settings/adPrivacy", "Sites you visit can pick ads to show you elsewhere."],
  ["websites", "adMeasurementEnabled", "Ad measurement", "on", "off", false, "chrome://settings/adPrivacy", "Sites and advertisers measure how their ads did, using your browser."],
  ["network", "networkPredictionEnabled", "Preload pages", "on", "off", null, "chrome://settings/performance", "Faster pages, at the cost that sites Chrome guesses you will visit see you arrive before you click."],
  ["services", "searchSuggestEnabled", "Search suggestions", "on", "off", null, "chrome://settings/syncSetup", "Suggestions as you type, at the cost that what you type goes to your search engine before you press Enter."],
  ["websites", "doNotTrackEnabled", "Do Not Track request", "sent", "not sent", null, "chrome://settings/cookies", "Asks sites not to track you. Most ignore it."],
  ["services", "passwordSavingEnabled", "Offer to save passwords", "on", "off", null, "chrome://password-manager/settings", "Off is right if a password manager does this for you."],
];
// WebRTC's route has no switch in Chrome's settings; an extension is the only way to set it.
const ROUTES = [
  ["default", "Any route (Chrome's default)"],
  ["default_public_interface_only", "Only the route your browsing takes"],
  ["disable_non_proxied_udp", "Only through a proxy, or not at all"],
];
const ASK = { permissions: ["privacy"] };

async function privacyCard(box = card("Chrome's privacy switches", "wide")) {
  const body = [];
  if (!(await chrome.permissions.contains(ASK))) {
    const go = el("button", "btn", "Show them");
    go.type = "button";
    // Chrome only shows its permission prompt straight from a click.
    go.onclick = async () => { if (await chrome.permissions.request(ASK)) privacyCard(box); };
    body.push(el("p", "sc-note", "How Chrome itself is set, read from Chrome and shown here with which way is the private one. Chrome will ask to let this page “change your privacy-related settings”. It changes one, and only when you choose to: the route WebRTC takes, which has no switch in Chrome."), go);
  } else {
    const rows = { bad: [], warn: [], good: [], plain: [] };
    for (const [area, key, name, on, off, wanted, page, why, matters = "warn"] of SWITCHES) {
      const setting = chrome.privacy[area] && chrome.privacy[area][key];
      if (!setting) continue; // a Chrome without this switch
      const { value } = await setting.get({});
      const kind = wanted === null ? "plain" : value === wanted ? "good" : matters;
      const change = el("button", "mini", "Change in Chrome");
      change.type = "button";
      change.dataset.go = page;
      change.setAttribute("aria-label", `Change ${name} in Chrome`);
      const head = el("p", "sw-say");
      head.append(mark(kind), el("b", null, name), el("span", "state", value ? on : off));
      const row = el("div", `sw ${kind}`);
      const what = el("div", "sw-name");
      what.append(head, el("p", "way-why", why));
      row.append(what, change);
      rows[kind].push(row);
    }
    const judged = rows.good.length + rows.warn.length + rows.bad.length;
    const score = el("div", "score");
    score.setAttribute("role", "img");
    score.setAttribute("aria-label", `${rows.good.length} of ${judged} set the private way`);
    for (let i = 0; i < judged; i++) score.append(el("i", i < rows.good.length ? "on" : ""));
    const tally = el("p", "sw-tally", `${rows.good.length} of ${judged} set the private way`);
    const groups = el("div", "switches");
    const group = (title, list) => {
      if (!list.length) return;
      const col = el("section", "sw-group");
      col.append(el("h3", null, title), ...list);
      groups.append(col);
    };
    group("Worth a look", [...rows.bad, ...rows.warn]);
    group("Already private", rows.good);
    group("Your call", rows.plain);

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
    const label = el("div", "sw-name");
    label.append(el("b", null, "WebRTC route"), el("p", "way-why", mine
      ? "Which way video-call traffic may go. Narrowing it stops WebRTC showing sites an address your VPN or proxy hides, and can break calls on some networks. Chrome has no switch for this; while it is set here, this extension holds it."
      : "Set by another extension or by your organization, so it can't be changed here."));
    rtc.append(label, pick);
    body.push(tally, score, groups, rtc);
  }
  box.replaceChildren(el("h2", null, "Chrome's privacy switches"), ...body);
  return box;
}

// ---------- the page ----------
// Built once, so what was found stays on the page while the tab is open. The check starts as
// the page is built; the cards that need no network are already there when it lands.
let built = false;
let privacyBox = null;
export async function renderTools(root) {
  if (built) return;
  built = true;
  const hero = heroPanel();
  const grid = el("div", "tl-grid");
  root.replaceChildren(hero.box, grid);
  hero.run();
  privacyBox = await privacyCard();
  grid.append(await fingerprintCard(), speedCard(), privacyBox);
}
