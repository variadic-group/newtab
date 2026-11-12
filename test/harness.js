// Shared by the tests and the screenshots: loads the extension into Playwright's Chromium with
// every outside request stubbed, and seeds a bookmarks bar.
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const { chromium } = createRequire(import.meta.url)("playwright");
export const root = path.join(import.meta.dirname, "..");
export const shipped = path.join(root, "extension");
export const manifest = JSON.parse(fs.readFileSync(path.join(shipped, "manifest.json"), "utf8"));

// Today, Shortcuts and Tools are behind the mark at the top left: open it, then pick.
export async function nav(page, name) {
  if (await page.$eval("#menu", (m) => m.hidden)) await page.click("#menuBtn");
  await page.click(`#pages .tab:has-text("${name}")`);
}

// Chrome's permission prompt can't be answered from a test, so the extras are tested on a copy
// of the extension that holds their two permissions from the start.
export function grantedCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "newtab-granted-"));
  fs.cpSync(shipped, dir, { recursive: true });
  const m = { ...manifest, permissions: [...manifest.permissions, ...manifest.optional_permissions], host_permissions: [...manifest.host_permissions, ...manifest.optional_host_permissions] };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(m));
  return dir;
}

function png(n, [r, g, b]) {
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = y * (n * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255; }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(n, 0); head.writeUInt32BE(n, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const colour = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 255; return [h, (h * 7) % 255, (h * 13) % 255]; };
const iso = (d) => { const p = (n) => String(n).padStart(2, "0"); const off = -d.getTimezoneOffset(); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00:00${off >= 0 ? "+" : "-"}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`; };

// The forecast starts from `base`: now in the tests, the pinned moment in the screenshots.
function forecast(base) {
  const texts = [["Sunny", 73], ["Partly Cloudy", 55], ["Partly Sunny", 71], ["Light Rain Likely", 58, 60], ["Rain", 65, 99], ["Rain Likely", 54, 70], ["Chance Showers", 62, 40], ["Mostly Clear", 50], ["Sunny", 64], ["Clear", 49], ["Mostly Sunny", 66], ["Mostly Clear", 50], ["Sunny", 67], ["Clear", 51], ["Sunny", 68]];
  const now = new Date(base); now.setMinutes(0, 0, 0);
  const periods = [];
  let day = now.getHours() >= 6 && now.getHours() < 18;
  let start = new Date(now);
  for (let i = 0; i < 14; i++) {
    const [text, temp, pop] = texts[day ? i - (i % 2) : i - (i % 2) + 1] || texts[i];
    periods.push({ name: i ? "Later" : "Veterans Day", startTime: iso(start), isDaytime: day, temperature: temp, temperatureUnit: "F", probabilityOfPrecipitation: { value: pop || 0 }, windSpeed: "3 to 13 mph", windDirection: "S", shortForecast: text });
    const next = new Date(start); next.setHours(day ? 18 : 6); if (next <= start) next.setDate(next.getDate() + 1);
    start = next; day = !day;
  }
  return periods;
}
function hourly(base) {
  const now = new Date(base); now.setMinutes(0, 0, 0);
  return Array.from({ length: 36 }, (_, i) => {
    const d = new Date(+now + i * 3600e3), h = d.getHours();
    return { startTime: iso(d), isDaytime: h >= 6 && h < 18, temperature: Math.round(62 + 9 * Math.sin(((h - 9) / 24) * 2 * Math.PI)), probabilityOfPrecipitation: { value: i > 16 && i < 23 ? 20 + (i - 16) * 10 : 0 }, windSpeed: "4 mph", windDirection: "WNW", shortForecast: i > 16 && i < 23 ? "Light Rain" : h >= 6 && h < 18 ? "Sunny" : "Mostly Clear" };
  });
}

// A stand-in for a radar frame: land, water, and a band of rain. Not a real observation.
const RADAR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 550"><defs><filter id="b"><feGaussianBlur stdDeviation="16"/></filter><filter id="s"><feGaussianBlur stdDeviation="7"/></filter></defs>
<rect width="600" height="550" fill="#dfe6dc"/><path d="M0 0H210C240 90 170 150 220 240C260 320 190 380 250 470L270 550H0Z" fill="#b9d3e6"/>
<g stroke="#b9c2b4" stroke-width="1" fill="none"><path d="M260 60H600M300 180H600M250 300H600M290 420H600M360 0V550M470 0V550"/></g>
<g filter="url(#b)" opacity=".8"><ellipse cx="330" cy="150" rx="150" ry="60" fill="#46b34a" transform="rotate(-28 330 150)"/><ellipse cx="420" cy="330" rx="130" ry="50" fill="#46b34a" transform="rotate(-20 420 330)"/></g>
<g filter="url(#s)" opacity=".9"><ellipse cx="330" cy="150" rx="80" ry="22" fill="#f2d33b" transform="rotate(-28 330 150)"/><ellipse cx="345" cy="140" rx="30" ry="9" fill="#ef7d2a" transform="rotate(-28 345 140)"/><ellipse cx="430" cy="325" rx="60" ry="16" fill="#f2d33b" transform="rotate(-20 430 325)"/></g>
<circle cx="300" cy="275" r="5" fill="#11151b"/></svg>`;

// What the place search answers, by what was typed. The postal code comes back foreign-first and
// the street address as three things in one town, the way the real service answers them.
const us = (city, state, more = {}) => ({ city, state, country: "United States", country_code: "us", ...more });
const PLACES = {
  oakland: [
    { name: "Oakland", lat: "37.8044", lon: "-122.2712", addresstype: "city", address: us("Oakland", "California") },
    { name: "Oakland County", lat: "42.6618", lon: "-83.3804", addresstype: "county", address: { county: "Oakland County", state: "Michigan", country: "United States", country_code: "us" } },
  ],
  paris: [{ name: "Paris", lat: "48.8566", lon: "2.3522", addresstype: "city", address: { city: "Paris", state: "Île-de-France", country: "France", country_code: "fr" } }],
  94103: [
    { name: "94103", lat: "55.7", lon: "21.13", addresstype: "postcode", address: { postcode: "94103", city: "Klaipėda", state: "Klaipėda County", country: "Lithuania", country_code: "lt" } },
    { name: "94103", lat: "37.7726", lon: "-122.4099", addresstype: "postcode", address: us("San Francisco", "California", { postcode: "94103" }) },
  ],
  "1 market st, san francisco": [
    { name: "Southern Pacific Building", lat: "37.7939", lon: "-122.3950", addresstype: "building", address: us("San Francisco", "California", { road: "Market Street" }) },
    { name: "", lat: "37.7941", lon: "-122.3951", addresstype: "place", address: us("San Francisco", "California") },
    { name: "", lat: "37.7940", lon: "-122.3949", addresstype: "amenity", address: us("San Francisco", "California") },
  ],
};

// icons: "stub" answers the icon services the way they answer (a miss is 16 px), "letters"
// misses everything so every tile shows its initial, which is what the screenshots use.
// locate: false leaves the browser with no way to find itself, as on a computer whose location
// service is off; the page then falls back to the stubbed network estimate, which is in
// America/Los_Angeles unless net.estimateAs says otherwise.
export async function launch({ ext = shipped, icons = "stub", locate = true, viewport = { width: 1360, height: 900 }, ...context } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "newtab-profile-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport, ...context,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    ...(locate ? { geolocation: { latitude: 40.7128, longitude: -74.006 }, permissions: ["geolocation"] } : {}),
  });
  // `at` moves the stubbed forecast to a moment; `titles` names stubbed pages by a piece of their address.
  const net = { weatherDown: false, estimateDown: false, estimateAs: null, estimates: 0, tools: [], zones: [], exitNear: false, dnsHome: false, points: [], searches: [], holdPage: false, unread: 7, at: null, titles: { "docs.google.com/spreadsheets": "Q4 plan - Google Sheets", "docs.google.com/document": "Launch notes - Google Docs" } };
  await ctx.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("chrome-extension://")) {
      if (net.holdPage && u.endsWith("/newtab.js")) await new Promise((r) => setTimeout(r, 1500));
      return route.continue();
    }
    const url = new URL(u);
    if (url.hostname === "api.weather.gov") {
      if (net.weatherDown) return route.abort();
      if (u.includes("/points/")) {
        const at = u.split("/points/")[1];
        net.points.push(at);
        if (at.startsWith("48.")) return route.fulfill({ status: 404, json: { title: "Data Unavailable For Requested Point" } });
        const ny = at.startsWith("40.71");
        return route.fulfill({ json: { properties: { forecast: "https://api.weather.gov/gridpoints/X/1,1/forecast", forecastHourly: "https://api.weather.gov/gridpoints/X/1,1/forecast/hourly", radarStation: ny ? "KOKX" : "KMUX", relativeLocation: { properties: { city: ny ? "New York" : "San Francisco", state: ny ? "NY" : "CA" } } } } });
      }
      return route.fulfill({ json: { properties: { periods: u.endsWith("/hourly") ? hourly(net.at ?? Date.now()) : forecast(net.at ?? Date.now()) } } });
    }
    // The Tools page's checks. ipleak.net says where the address is: Stockholm, or New York (where
    // the tests' computer is) when net.exitNear is set; there is no IPv6 on this network. Its
    // DNS detection answers only a session of forty digits, as the real one does, with three
    // servers that are another company's in the United States, or the exit's own network when
    // net.dnsHome is set. Cloudflare's endpoints serve the speed reading.
    const open = { "access-control-allow-origin": "*" };
    if (url.hostname.endsWith("ipleak.net")) {
      const exit = net.exitNear
        ? { ip: "203.0.113.7", isp_name: "Example Networks", as_number: 64500, city_name: "New York", region_name: "New York", country_name: "United States", country_code: "US", time_zone: "America/New_York", latitude: 40.71, longitude: -74.01 }
        : { ip: "203.0.113.7", isp_name: "Example Networks", as_number: 64500, city_name: "Stockholm", region_name: "Stockholm County", country_name: "Sweden", country_code: "SE", time_zone: "Europe/Stockholm", latitude: 59.33, longitude: 18.07 };
      if (url.hostname === "ipv6.ipleak.net") { net.tools.push("v6"); return route.abort(); }
      if (url.hostname === "ipv4.ipleak.net") { net.tools.push("v4"); return route.fulfill({ json: exit, headers: open }); }
      if (url.pathname.startsWith("/dnsdetection")) {
        net.tools.push("dns");
        const session = url.hostname.split("-")[0];
        return route.fulfill({ json: { session, ip: /^\d{40}$/.test(session) ? { "198.51.100.1": 1, "198.51.100.2": 1, "198.51.100.3": 2 } : {} }, headers: open });
      }
      if (url.pathname.startsWith("/json/")) {
        net.tools.push("lookup");
        const ip = url.pathname.split("/")[2];
        return route.fulfill({ json: net.dnsHome ? { ...exit, ip, city_name: null } : { ip, isp_name: "Example DNS Inc.", as_number: 64501, country_name: "United States", country_code: "US", city_name: null, region_name: null, time_zone: null, latitude: null, longitude: null }, headers: open });
      }
    }
    if (url.hostname === "speed.cloudflare.com") {
      net.tools.push(url.pathname.slice(1));
      if (url.pathname === "/__down") return route.fulfill({ body: Buffer.alloc(Math.min(+url.searchParams.get("bytes"), 2e6)), headers: open });
      if (url.pathname === "/__up") return route.fulfill({ body: "", headers: open });
    }
    // The network's city, as the estimate service answers it (its name for the country and all).
    if (url.hostname === "api.bigdatacloud.net" && url.searchParams.has("latitude")) {
      // Asked with a spot, it says which time zone that spot is in.
      const lon = +url.searchParams.get("longitude");
      net.zones.push(`${url.searchParams.get("latitude")},${lon}`);
      const zone = lon > 100 ? "Asia/Tokyo" : lon > -20 ? "Europe/Paris" : "America/Los_Angeles";
      return route.fulfill({ json: { localityInfo: { informative: [{ name: zone, description: "time zone" }] } }, headers: { "access-control-allow-origin": "*" } });
    }
    if (url.hostname === "api.bigdatacloud.net") {
      net.estimates++;
      if (net.estimateDown) return route.abort();
      const at = { latitude: 37.7749, longitude: -122.4194, city: "San Francisco", principalSubdivision: "California", countryCode: "US", countryName: "United States of America (the)", zone: "America/Los_Angeles", ...net.estimateAs };
      const { zone, ...where } = at;
      return route.fulfill({ json: { ...where, lookupSource: "ip geolocation", locality: where.city, localityInfo: { informative: [{ name: "North America", description: "continent in the Americas" }, { name: zone, description: "time zone" }, { name: "06", description: "FIPS code" }, { name: "x" }] } }, headers: { "access-control-allow-origin": "*" } });
    }
    if (url.hostname === "nominatim.openstreetmap.org") {
      const q = url.searchParams.get("q");
      net.searches.push(q);
      return route.fulfill({ json: PLACES[q.toLowerCase()] || [], headers: { "access-control-allow-origin": "*" } });
    }
    if (u.startsWith("https://mail.google.com/mail/u/0/feed/atom")) return route.fulfill({ contentType: "application/atom+xml", body: `<?xml version="1.0"?><feed xmlns="http://purl.org/atom/ns#"><title>Inbox</title><fullcount>${net.unread}</fullcount></feed>` });
    if (u.includes("gstatic.com/images/branding/product")) return icons === "letters" ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ contentType: "image/png", body: png(96, colour(u)) });
    if (u.includes("/s2/favicons")) {
      const d = url.searchParams.get("domain");
      const miss = icons === "letters" || d === "app.examplebank.com" || d.endsWith("product.example");
      return route.fulfill({ contentType: "image/png", body: png(miss ? 16 : 64, colour(d)) });
    }
    if (url.hostname === "radar.weather.gov") return route.fulfill({ contentType: "image/svg+xml", body: RADAR });
    // A page that keeps changing its title, the way a mail tab or a build page does.
    if (u.endsWith("/ticker")) return route.fulfill({ contentType: "text/html", body: '<title>tick 0</title><script>let n = 0; setInterval(() => { document.title = "tick " + ++n; }, 200);</script>' });
    if (route.request().resourceType() === "document") {
      const named = Object.keys(net.titles).find((k) => u.includes(k));
      return route.fulfill({ contentType: "text/html", body: `<title>${named ? net.titles[named] : "Stub " + url.hostname}</title><p>stub</p>` });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const id = sw.url().split("/")[2];
  const errs = [];
  // A page with the extension's new tab on it. `at` pins the page's clock to a moment.
  const open = async ({ at, waitUntil } = {}) => {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/404|ERR_FAILED|weather|Network location provider/.test(m.text())) errs.push(m.text()); });
    // Playwright's own clock is shared by every page in the browser, so the moment is pinned in
    // this page alone: timers still run, and Date always answers `at`.
    if (at) await page.addInitScript((ms) => {
      const Real = Date;
      globalThis.Date = class extends Real {
        constructor(...args) { super(...(args.length ? args : [ms])); }
        static now() { return ms; }
      };
    }, Date.parse(at));
    await page.goto(`chrome-extension://${id}/newtab.html`, { waitUntil });
    return page;
  };
  const tree = () => sw.evaluate(async () => (await chrome.bookmarks.getTree())[0]);
  const find = (n, title) => { if (n.title === title) return n; for (const c of n.children || []) { const r = find(c, title); if (r) return r; } return null; };
  const titles = async (name) => find(await tree(), name).children.map((c) => c.title);
  return { ctx, sw, id, net, errs, open, tree, find, titles };
}

// A bookmarks bar with two spaces. The names are made up; only Google's own apps are real.
export function seed(sw) {
  return sw.evaluate(async () => {
    const mk = (parentId, title, url) => chrome.bookmarks.create({ parentId, title, url });
    const fill = async (parentId, links) => { for (const [title, url] of links) await mk(parentId, title, url); };
    const work = await mk("1", "🏢 Work");
    await fill((await mk(work.id, "✉️ Workspace")).id, [["Gmail", "https://mail.google.com/"], ["Calendar", "https://calendar.google.com/calendar/u/0/r"], ["Drive", "https://drive.google.com/"], ["Keep", "https://keep.google.com/"], ["Admin console", "https://admin.google.com/"]]);
    await fill((await mk(work.id, "💵 Money")).id, [["Stripe", "https://dashboard.stripe.com/"], ["Bank", "https://app.examplebank.com/"]]);
    const company = await mk(work.id, "🏢 Company");
    await fill(company.id, [["Todo list", "https://todo.example.com/"], ["Plan", "https://claude.ai/artifact/abc123"], ["Claude", "https://claude.ai/new"], ["GitHub", "https://github.com/"], ["Agent", "https://account.exampleagent.com/"]]);
    const filings = await mk(company.id, "🏛️ Filings");
    await fill(filings.id, [["State tax", "https://tax.example.gov/"]]);
    await fill((await mk(filings.id, "Federal")).id, [["IRS", "https://www.irs.gov/"]]);
    await fill((await mk(work.id, "🧰 Platform")).id, [["Hosting", "https://console.examplehost.com/"], ["DNS", "https://dash.exampledns.com/"], ["Analytics", "https://app.exampleanalytics.com/"], ["Email", "https://examplemail.com/"]]);
    const product = await mk("1", "📖 Product");
    await fill((await mk(product.id, "🌐 Live")).id, [["Website", "https://product.example/"], ["Back office", "https://office.product.example/"]]);
    await fill((await mk(product.id, "💻 Code")).id, [["Repository", "https://github.com/example/product"], ["Builds", "https://ci.example.com/"]]);
  });
}
