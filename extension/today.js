// The Today page and the glance strip: the clock, the sun's path through the sky with the moon,
// the National Weather Service forecast and the radar. Nothing here waits for the network before
// drawing: it starts from the saved place and the last forecast, then replaces them.
import { $, el } from "./dom.js";
import { getPlace, placeKey, placeMoved } from "./place.js";
import { sunPosition, sunTimes, moonPosition, moonPhase, moonTimes, lightPhase, nextLight, nightSpan, skyColors } from "./sky.js";
import { MAP, dots, spot, daylight, overhead, sunMark, svg as mapSvg } from "./world.js";

const FRESH_MS = 20 * 60e3;
const DAY_MS = 864e5;

const fmtTime = (d) => (d ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "—");
const fmtHour = (d) => d.toLocaleTimeString(undefined, { hour: "numeric" });
// A time without its AM or PM, for places where the column it sits in already says which.
const fmtBare = (d) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).formatToParts(d).filter((p) => p.type !== "dayPeriod").map((p) => p.value).join("").trim();
const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function span(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

// ---------- light and dark ----------
// The page is dark when the system asks for dark, or when it is night where you are: the sun
// more than 6° down, the end of civil twilight. Tonight's dusk and dawn are left in localStorage
// so theme.js can apply the same rule before the next tab paints.
function applyTheme(place) {
  const now = new Date();
  let night = false;
  let saved = null;
  if (place) {
    night = sunPosition(now, place.lat, place.lon).altitude < -6;
    const n = nightSpan(now, place.lat, place.lon);
    // Where the sun stays down all day there is no dusk to wait for.
    saved = n ? { from: +n.from, to: +n.to } : night ? { from: +now, to: +now + DAY_MS } : null;
  }
  if (saved) localStorage.setItem("night", JSON.stringify(saved)); else localStorage.removeItem("night");
  // A choice made in Settings stands; otherwise the sun and the system decide.
  const pick = localStorage.getItem("theme");
  document.documentElement.dataset.theme = pick === "light" || pick === "dark" ? pick : night || matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// ---------- the forecast ----------
async function getJSON(u) {
  const r = await fetch(u, { headers: { Accept: "application/geo+json" } });
  if (!r.ok) throw Object.assign(new Error(`the weather service answered ${r.status}`), { status: r.status });
  return r.json();
}

// Which forecast grid and radar a place belongs to never changes, so look it up once per place.
async function gridFor(place) {
  const key = placeKey(place);
  const { grid } = await chrome.storage.local.get("grid");
  if (grid && grid.key === key) return grid;
  const p = (await getJSON(`https://api.weather.gov/points/${key}`)).properties;
  const rel = p.relativeLocation && p.relativeLocation.properties;
  const g = { key, daily: p.forecast, hourly: p.forecastHourly, station: p.radarStation, place: rel ? `${rel.city}, ${rel.state}` : "" };
  await chrome.storage.local.set({ grid: g });
  return g;
}

const slim = (p) => ({
  start: p.startTime,
  day: p.isDaytime,
  temp: p.temperature,
  pop: (p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value) || 0,
  text: p.shortForecast,
  wind: `${p.windSpeed} ${p.windDirection}`,
});

// One request per place at a time. A forecast is saved only if it is still for the place in use,
// so one asked for before the place changed can't replace the newer place's.
const inflight = new Map();
function refreshWeather(place) {
  const key = placeKey(place);
  if (!inflight.has(key)) inflight.set(key, (async () => {
    const g = await gridFor(place);
    const [d, h] = await Promise.all([getJSON(g.daily), getJSON(g.hourly)]);
    const wx = { key, at: Date.now(), place: g.place, station: g.station, daily: d.properties.periods.map(slim), hourly: h.properties.periods.slice(0, 30).map(slim) };
    const here = await getPlace();
    if (here && placeKey(here) === key) await chrome.storage.local.set({ wx });
    return wx;
  })().finally(() => inflight.delete(key)));
  return inflight.get(key);
}

async function cachedWeather(place) {
  const { wx } = await chrome.storage.local.get("wx");
  return wx && wx.key === placeKey(place) ? wx : null;
}

// Runs on every new tab, so the forecast is already here when it is looked at. A failure here is
// only logged: Today says so when it is opened, and the glance keeps the last forecast.
export async function warmWeather() {
  const place = await getPlace();
  if (!place) return;
  // A failure here is kept with the place it was for, so the strip can say why it has no weather.
  const quiet = (err) => { console.warn("weather:", err.message); chrome.storage.local.set({ wxWhy: { key: placeKey(place), abroad: err.status === 404, said: err.message } }); };
  const wx = await cachedWeather(place);
  if (!wx || Date.now() - wx.at > FRESH_MS) refreshWeather(place).catch(quiet);
  const moved = await placeMoved(place);
  if (moved) refreshWeather(moved).catch(quiet);
}

// ---------- the sky ----------
// The chart is the sky by hour angle and height: across is where a body stands in its daily
// turn (the middle is due south, where the sun is at solar noon), up is how high it is. Above the
// horizon a degree is a degree; below it the scale tightens so the three twilights get room.
const W = 640, HORIZON = 196, UP = 170, DOWN = 84, CHART_H = 290;
const xOf = (hourAngle) => W / 2 + hourAngle * W;
const yOf = (alt) => (alt >= 0 ? HORIZON - (alt / 90) * UP : HORIZON + (DOWN * (1 - Math.exp(alt / 22))) / (1 - Math.exp(-90 / 22)));
const SVG = "http://www.w3.org/2000/svg";
function svg(tag, attrs, text) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text) n.textContent = text;
  return n;
}

// The parts that never move: the twilight bands under the horizon, and the stars.
function buildSky() {
  const bands = [["Civil", 0, -6, "civil"], ["Nautical", -6, -12, "naut"], ["Astronomical", -12, -18, "astro"], ["Night", -18, null, "night"]];
  for (const [name, top, bottom, cls] of bands) {
    const y = yOf(top), h = (bottom === null ? CHART_H : yOf(bottom)) - y;
    // Named in the middle, under the dome: the one stretch the sun's path never dips through.
    $("bands").append(svg("rect", { class: `band ${cls}`, x: 0, y: y.toFixed(1), width: W, height: (h + 0.5).toFixed(1) }), svg("text", { class: "band-name", x: W / 2, y: (y + Math.min(h, 22) / 2 + 3).toFixed(1) }, name));
  }
  for (let i = 1; i <= 46; i++) $("stars").append(svg("circle", { cx: ((i * 97.3) % W).toFixed(1), cy: (6 + ((i * 53.7) % 168)).toFixed(1), r: (0.5 + (i % 3) * 0.35).toFixed(2) }));
}

function drawClock() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).formatToParts(now);
  const digits = parts.filter((p) => p.type !== "dayPeriod").map((p) => p.value).join("").trim();
  const half = parts.find((p) => p.type === "dayPeriod");
  const t = $("bigTime");
  t.replaceChildren(digits);
  if (half) t.append(el("small", null, half.value));
  $("bigDate").textContent = fmtDate(now);
}

function drawSky(place) {
  if (!$("bands").childElementCount) buildSky();
  const now = new Date(), { lat, lon } = place;
  const t = sunTimes(now, lat, lon), sun = sunPosition(now, lat, lon);
  const c = skyColors(sun.altitude, document.documentElement.dataset.theme === "dark");
  const card = $("sky");
  card.style.setProperty("--sky-top", c.top);
  card.style.setProperty("--sky-horizon", c.horizon);
  card.style.setProperty("--sky-ink", c.lightInk ? "#f2f5fa" : "#11151b");
  card.style.setProperty("--sky-muted", c.lightInk ? "rgb(242 245 250 / 0.74)" : "rgb(17 21 27 / 0.64)");
  card.style.setProperty("--sun-now", c.sun);
  $("stars").style.opacity = c.stars;

  // The sun's whole path for this solar day, every ten minutes from one solar midnight to the next.
  const pts = [];
  for (let i = 0; i <= 144; i++) {
    const at = new Date(+t.midnight + i * 600e3);
    pts.push([(i / 144) * W, yOf(sunPosition(at, lat, lon).altitude), +at]);
  }
  const line = (list) => list.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const path = line(pts);
  $("sunPathUp").setAttribute("d", path);
  $("sunPathDown").setAttribute("d", path);
  $("dayArea").setAttribute("d", `${path} L${W} ${HORIZON} L0 ${HORIZON} Z`);
  $("dayArea").style.opacity = sun.altitude > 0 ? 1 : 0.35;

  // At solar midnight the sun leaves one edge and comes in at the other; keep its disc whole.
  const sx = Math.min(W - 12, Math.max(12, xOf(sun.hourAngle))).toFixed(1), sy = yOf(sun.altitude).toFixed(1);
  const gone = pts.filter((p) => p[2] <= +now);
  $("sunDone").setAttribute("d", `${gone.length ? line(gone) + " L" : "M"}${sx} ${sy}`);
  $("sunDone").style.opacity = sun.altitude > 0 ? 1 : 0.4;
  for (const id of ["sunDot", "sunGlow"]) { $(id).setAttribute("cx", sx); $(id).setAttribute("cy", sy); }
  $("sunGlow").style.opacity = sun.altitude > -6 ? 1 : 0.35;

  const mark = (id, when) => {
    $(id).style.display = when ? "" : "none";
    if (when) $(id).setAttribute("cx", (((when - t.midnight) / DAY_MS) * W).toFixed(1));
  };
  mark("riseMark", t.sunrise);
  mark("setMark", t.sunset);
  const peak = sunPosition(t.noon, lat, lon).altitude;
  $("noonText").style.display = peak > 2 ? "" : "none";
  $("noonText").setAttribute("x", W / 2);
  $("noonText").setAttribute("y", (yOf(peak) - 20).toFixed(1));
  $("noonText").textContent = `solar noon ${fmtTime(t.noon)}`;

  // The moon where it really is, lit on the side that faces the sun.
  const moon = moonPosition(now, lat, lon), phase = moonPhase(now);
  const up = moon.altitude > -0.3;
  $("moon").style.display = up ? "" : "none";
  if (up) {
    const r = 11, ry = (r * Math.abs(1 - 2 * phase.fraction)).toFixed(2);
    $("moon").setAttribute("transform", `translate(${xOf(moon.hourAngle).toFixed(1)} ${yOf(moon.altitude).toFixed(1)})`);
    $("moon").style.opacity = sun.altitude > 0 ? 0.6 : 1;
    // Drawn with the lit edge on top, then turned to where that edge really points. South of the
    // equator the sky is watched facing north, so the turn is mirrored.
    $("moonLit").setAttribute("d", `M${-r} 0 A${r} ${r} 0 0 1 ${r} 0 A${r} ${ry} 0 0 ${phase.fraction < 0.5 ? 0 : 1} ${-r} 0 Z`);
    $("moonLit").setAttribute("transform", `rotate(${(lat < 0 ? moon.tilt : -moon.tilt).toFixed(1)})`);
  }

  const next = nextLight(now, lat, lon);
  $("phase").textContent = lightPhase(sun.altitude);
  $("nextUp").textContent = next ? `${cap(next.label)} in ${span(next.at - now)}` : "";
  skyMidnight = +t.midnight;
  if (pointed) sayThen(place);
  $("rise").textContent = fmtTime(t.sunrise);
  $("set").textContent = fmtTime(t.sunset);
  const list = (...items) => cap(items.filter((i) => i[1]).map((i) => `${i[0]} ${fmtBare(i[1])}`).join(", "));
  $("riseSub").textContent = list(["first light", t.firstLight], ["dawn", t.dawn]);
  $("setSub").textContent = list(["dusk", t.dusk], ["last light", t.lastLight]);
  $("daylight").textContent = t.sunrise && t.sunset ? `${span(t.sunset - t.sunrise)} of daylight` : peak > 0 ? "The sun stays up today" : "The sun stays down today";
  const mt = moonTimes(now, lat, lon);
  const turn = up ? mt.set && `sets ${fmtTime(mt.set)}` : mt.rise && `rises ${fmtTime(mt.rise)}`;
  $("moonLine").textContent = [`${phase.emoji} ${phase.name}`, `${Math.round(phase.fraction * 100)}% lit`, turn].filter(Boolean).join(", ");
}

// ---------- drawing the forecast ----------
function glyph(text, day, moon) {
  const t = (text || "").toLowerCase();
  if (/thunder/.test(t)) return "⛈️";
  if (/snow|sleet|flurr|ice|freez|wintry/.test(t)) return "🌨️";
  if (/rain|shower|drizzle/.test(t)) return day && /chance|slight/.test(t) ? "🌦️" : "🌧️";
  if (/fog|haze|smoke|mist/.test(t)) return "🌫️";
  if (/mostly cloudy|overcast|^cloudy/.test(t)) return "☁️";
  if (/mostly sunny/.test(t)) return "🌤️";
  if (/partly/.test(t)) return day ? "⛅" : "☁️";
  if (/wind|breez/.test(t)) return "💨";
  return day ? "☀️" : moon || "🌙";
}

// One row per calendar day: the daytime period gives the high, that night's period the low.
function byDay(daily) {
  const days = new Map();
  for (const p of daily) {
    const date = p.start.slice(0, 10);
    const d = days.get(date) || { date, pop: 0 };
    if (p.day) d.hi = p.temp; else d.lo = p.temp;
    // The picture is the daytime's, unless the night is the wet part of the day.
    if (!d.text || p.day || (p.pop >= 50 && p.pop > d.pop)) { d.text = p.text; d.day = p.day || d.day === true; }
    d.pop = Math.max(d.pop, p.pop);
    days.set(date, d);
  }
  return [...days.values()].slice(0, 7);
}

function hourChart(hours) {
  const width = 600, left = 24, right = 24, top = 30, bottom = 92, floor = 104;
  const temps = hours.map((h) => h.temp);
  const min = Math.min(...temps), max = Math.max(...temps);
  const x = (i) => left + (i * (width - left - right)) / (hours.length - 1);
  const y = (t) => (max === min ? (top + bottom) / 2 : bottom - ((t - min) / (max - min)) * (bottom - top));
  const pts = hours.map((h, i) => [x(i), y(h.temp)]);
  let line = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    line += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${floor} L${pts[0][0].toFixed(1)} ${floor} Z`;
  const wet = Math.max(...hours.map((h) => h.pop)) >= 15;
  let marks = "";
  hours.forEach((h, i) => {
    if (wet && h.pop > 0) {
      const bar = (h.pop / 100) * 18;
      marks += `<rect class="hc-rain" x="${(x(i) - 5).toFixed(1)}" y="${(floor - bar).toFixed(1)}" width="10" height="${bar.toFixed(1)}" rx="2"/>`;
    }
    if (i % 3) return;
    marks += `<circle class="hc-dot" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="${i ? 2.5 : 4}"/>`;
    marks += `<text class="hc-t" x="${pts[i][0].toFixed(1)}" y="${(pts[i][1] - 10).toFixed(1)}">${h.temp}°</text>`;
    marks += `<text class="hc-h" x="${pts[i][0].toFixed(1)}" y="124">${i ? fmtHour(new Date(h.start)) : "Now"}</text>`;
  });
  return `<svg viewBox="0 0 ${width} 132" role="img" aria-label="Temperature for the next ${hours.length} hours">
    <defs><linearGradient id="hcFill" x1="0" y1="0" x2="0" y2="1"><stop class="hc-a" offset="0"/><stop class="hc-b" offset="1"/></linearGradient></defs>
    <path class="hc-area" d="${area}"/><path class="hc-line" d="${line}"/>${marks}</svg>`;
}

// The hour we are in, the hours after it, and the days with their highs and lows.
function nowOf(wx) {
  const hours = wx.hourly.filter((h) => Date.parse(h.start) + 3600e3 > Date.now()).slice(0, 24);
  const days = byDay(wx.daily);
  return { hours, days, now: hours[0] || wx.daily[0], today: days[0] || {} };
}
const radarUrl = (station, which) => `https://radar.weather.gov/ridge/standard/${station}_${which}.gif?t=${Math.floor(Date.now() / 300000)}`;
// The place's name over the forecast. One estimated from the network says so, and why.
function showPlace(place, wx) {
  const rough = place.source === "network";
  $("place").textContent = (place.name || (wx && wx.place) || `${place.lat}, ${place.lon}`) + (rough ? " (approximate)" : "");
  $("placeBtn").title = rough ? `Estimated from your network. ${place.why || ""} Click to set the place.` : "Change the place";
}

function drawWeather(wx, place) {
  showPlace(place, wx);
  $("updated").textContent = `National Weather Service, ${fmtTime(new Date(wx.at))}`;
  const { hours, days, now, today } = nowOf(wx);

  const facts = [];
  if (today.hi != null) facts.push(`High ${today.hi}°`);
  if (today.lo != null) facts.push(`Low ${today.lo}°`);
  facts.push(`Wind ${now.wind}`);
  if (now.pop) facts.push(`Rain ${now.pop}%`);
  const desc = el("div", "wx-desc");
  desc.append(el("div", "wx-text", now.text), el("div", "cap", facts.join(", ")));
  const picture = glyph(now.text, now.day, moonPhase(new Date()).emoji);
  $("wxNow").replaceChildren(el("div", "wx-glyph", picture), el("div", "wx-temp", `${now.temp}°`), desc);
  skyWxNow = `${picture} ${now.temp}° and ${now.text.toLowerCase()}`;
  $("skyWx").textContent = skyWxNow;

  $("wxHours").innerHTML = hours.length > 3 ? hourChart(hours) : "";
  hoursNow = hours.length > 3 ? hours : [];
  followHours(place);

  const lows = days.map((d) => (d.lo != null ? d.lo : d.hi)), highs = days.map((d) => (d.hi != null ? d.hi : d.lo));
  const min = Math.min(...lows), max = Math.max(...highs), range = max - min || 1;
  const todayDate = new Date().toLocaleDateString("en-CA");
  $("wxDays").replaceChildren(...days.map((d) => {
    const li = el("li");
    const name = d.date === todayDate ? "Today" : new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
    const lo = d.lo != null ? d.lo : d.hi, hi = d.hi != null ? d.hi : d.lo;
    const bar = el("span", "range");
    const fill = el("i");
    fill.style.left = `${((lo - min) / range) * 100}%`;
    fill.style.width = `${Math.max(4, ((hi - lo) / range) * 100)}%`;
    bar.append(fill);
    const g = el("span", "g", glyph(d.text, d.day));
    g.title = d.text;
    li.append(el("span", "d", name), g, el("span", "p", d.pop >= 20 ? `${d.pop}%` : ""), el("span", "lo", d.lo != null ? `${d.lo}°` : ""), bar, el("span", "hi", d.hi != null ? `${d.hi}°` : ""));
    return li;
  }));

  if (wx.station) {
    const img = $("radarImg");
    const src = radarUrl(wx.station, "loop");
    if (img.src !== src) {
      img.onload = () => { $("radarCard").hidden = false; };
      img.onerror = () => { $("radarCard").hidden = true; };
      img.src = src;
    } else if (img.complete && img.naturalWidth) {
      // The same radar as before, hidden while another place's forecast was awaited.
      $("radarCard").hidden = false;
    }
    $("radarLink").href = `https://radar.weather.gov/station/${wx.station}/standard`;
    $("radarLink").textContent = `Station ${wx.station} on weather.gov`;
  } else $("radarCard").hidden = true;
}

function clearWeather(place, text) {
  showPlace(place);
  hoursNow = [];
  skyWxNow = "";
  $("updated").textContent = "";
  $("skyWx").textContent = "";
  $("wxNow").replaceChildren();
  $("wxHours").replaceChildren();
  $("wxDays").replaceChildren();
  $("radarCard").hidden = true;
  $("wxNote").textContent = text;
  $("wxNote").hidden = false;
}

// A forecast that arrives, or fails, after the place has changed is for somewhere else: the
// page has moved on and is left alone.
const still = async (place) => { const now = await getPlace(); return !!now && placeKey(now) === placeKey(place); };
const ABROAD = "No forecast for this place: the National Weather Service covers the United States. The sun and the moon are still right.";
async function update(place, hadForecast) {
  const note = $("wxNote");
  try {
    const wx = await refreshWeather(place);
    if (!(await still(place))) return;
    drawWeather(wx, place);
    note.hidden = true;
  } catch (err) {
    console.error("weather", err);
    if (!(await still(place))) return;
    if (hadForecast) {
      note.textContent = "Couldn't refresh the forecast just now, so this is the last one.";
      note.hidden = false;
    } else {
      clearWeather(place, err.status === 404
        ? ABROAD
        : `The forecast didn't load (${err.message}). It tries again the next time you open this tab.`);
    }
  }
}

// ---------- one moment, pointed at ----------
// The sky, the next 24 hours and the map of day and night are one clock. Pointing along any of
// them picks a moment: the sun's path marks where the sun will be, the hours mark the hour, the
// map is drawn for it, and the top of the sky says what it will be like then. Taking the pointer
// away puts everything back to now.
let pointed = null, hoursNow = [], skyMidnight = 0, skyWxNow = "";

// Where a moment falls along the hours: a fractional index, or null off the chart. The first
// point is now; each one after is the top of an hour.
function hourIndex(at) {
  if (!hoursNow.length || at < Date.now()) return null;
  for (let i = 0; i < hoursNow.length - 1; i++) {
    const from = i ? Date.parse(hoursNow[i].start) : Date.now(), to = Date.parse(hoursNow[i + 1].start);
    if (at < to) return i + (at - from) / (to - from);
  }
  return null;
}
// The weather at a moment, read off the hours: the temperature between the two either side.
function weatherAt(at) {
  const i = hourIndex(at);
  if (i === null) return "";
  const a = hoursNow[Math.floor(i)], b = hoursNow[Math.min(hoursNow.length - 1, Math.floor(i) + 1)];
  const temp = Math.round(a.temp + (b.temp - a.temp) * (i - Math.floor(i)));
  return `${glyph(a.text, a.day, moonPhase(new Date(at)).emoji)} ${temp}° and ${a.text.toLowerCase()}`;
}
function sayThen(place) {
  const at = new Date(pointed), now = new Date();
  const days = Math.round((new Date(at).setHours(12, 0, 0, 0) - new Date(now).setHours(12, 0, 0, 0)) / DAY_MS);
  const when = `${fmtTime(at)}${days === 1 ? " tomorrow" : days === -1 ? " yesterday" : ""}`;
  const next = nextLight(at, place.lat, place.lon);
  $("phase").textContent = `At ${when}`;
  $("nextUp").textContent = `${lightPhase(sunPosition(at, place.lat, place.lon).altitude)}${next ? `, ${next.label} in ${span(next.at - at)}` : ""}`;
  $("skyWx").textContent = weatherAt(+at);
}
function point(place, at) {
  pointed = at;
  const mark = $("skyThen");
  if (at === null) {
    mark.style.display = "none";
    drawSky(place);
    $("skyWx").textContent = skyWxNow;
  } else {
    const x = ((((at - skyMidnight) / DAY_MS) % 1) + 1) % 1 * W;
    const y = yOf(sunPosition(new Date(at), place.lat, place.lon).altitude);
    $("skyThenLine").setAttribute("x1", x.toFixed(1)); $("skyThenLine").setAttribute("x2", x.toFixed(1));
    $("skyThenSun").setAttribute("cx", x.toFixed(1)); $("skyThenSun").setAttribute("cy", y.toFixed(1));
    mark.style.display = "";
    sayThen(place);
  }
  const line = $("wxHours").querySelector(".hc-then"), i = at === null ? null : hourIndex(at);
  if (line) {
    line.style.display = i === null ? "none" : "";
    if (i !== null) { const x = (24 + (i * (600 - 48)) / (hoursNow.length - 1)).toFixed(1); line.setAttribute("x1", x); line.setAttribute("x2", x); }
  }
  drawWorld(place);
}
// Pointing along a picture: `toTime` turns where the pointer is, as a share of the picture's
// width, into a moment.
function pointable(node, place, toTime) {
  node.onpointermove = (e) => {
    const r = node.getBoundingClientRect();
    point(place, toTime(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))));
  };
  node.onpointerleave = () => point(place, null);
}

function drawWorld(place) {
  const at = pointed ? new Date(pointed) : new Date();
  const { lit, dark, sun } = daylight(at);
  $("worldDay").setAttribute("d", dots(lit));
  $("worldNight").setAttribute("d", dots(dark));
  const [x, y] = spot(place);
  const pin = mapSvg("g", { class: "pin you" });
  const left = x > 640;
  pin.append(mapSvg("circle", { class: "dot", cx: x, cy: y, r: 8 }), mapSvg("text", { x: x + (left ? -14 : 14), y: y + 8, "text-anchor": left ? "end" : "start" }, "You"));
  $("worldPins").replaceChildren(sunMark(sun), pin);
  $("worldSay").textContent = pointed ? `Day and night at ${fmtTime(at)}` : "Day and night, now";
  $("worldMap").setAttribute("aria-label", `Daylight is on ${Math.round((lit.length / (lit.length + dark.length)) * 100)}% of the land`);
}

// The hours chart gets its marker each time it is drawn.
function followHours(place) {
  const chart = $("wxHours").querySelector("svg");
  if (!chart) return;
  const mark = mapSvg("line", { class: "hc-then", y1: 14, y2: 104 });
  mark.style.display = "none";
  chart.append(mark);
  const step = (600 - 48) / (hoursNow.length - 1);
  pointable(chart, place, (f) => {
    const i = Math.max(0, Math.min(hoursNow.length - 1, (f * 600 - 24) / step)), whole = Math.floor(i);
    const from = whole ? Date.parse(hoursNow[whole].start) : Date.now();
    const to = whole + 1 < hoursNow.length ? Date.parse(hoursNow[whole + 1].start) : from + 3600e3;
    return from + (i - whole) * (to - from);
  });
}
// The sky runs from one solar midnight to the next; the map puts the sun over where you point,
// at the next moment it is there.
function followSky(place) {
  pointable($("sky").querySelector(".sky-chart"), place, (f) => skyMidnight + f * DAY_MS);
  pointable($("worldMap"), place, (f) => {
    const lon = f * 360 - 180, now = Date.now();
    const west = ((((overhead(new Date(now)).lon - lon) % 360) + 360) % 360);
    return now + (west / 360) * DAY_MS;
  });
}

// The place form shows itself while there is no place and goes once there is one. Opened by
// hand to change the place, it stays until one is chosen: a forecast arriving must not shut it.
let unplaced = false;
export async function renderToday() {
  const place = await getPlace();
  applyTheme(place);
  if (!place) $("todayAsk").hidden = false;
  else if (unplaced) $("todayAsk").hidden = true;
  unplaced = !place;
  $("todayGrid").hidden = !place;
  if (!place) return;
  drawClock();
  drawSky(place);
  drawWorld(place);
  followSky(place);
  const cached = await cachedWeather(place);
  // A place the weather service has already said it doesn't cover is said so at once, and not
  // asked again: that answer doesn't change.
  const { wxWhy } = await chrome.storage.local.get("wxWhy");
  if (!cached && wxWhy && wxWhy.key === placeKey(place) && wxWhy.abroad) return clearWeather(place, ABROAD);
  if (cached) { drawWeather(cached, place); $("wxNote").hidden = true; }
  else clearWeather(place, "Getting the forecast…");
  if (!cached || Date.now() - cached.at > FRESH_MS) update(place, !!cached);
}

// On a page with no sky on it, the hour still decides light or dark.
export async function tickTheme() {
  applyTheme(await getPlace());
}

export async function tickToday() {
  const place = await getPlace();
  if (!place) return;
  applyTheme(place);
  drawClock();
  drawSky(place);
  drawWorld(place);
}

// ---------- the glance: the same facts as one strip at the top of every space ----------
// It only ever draws what is already saved; warmWeather fetches, and the page redraws this when
// the saved forecast or place changes.
const along = (path, f) => path.getPointAtLength(Math.min(1, Math.max(0, f)) * path.getTotalLength());

export async function renderGlance() {
  const at = new Date();
  $("glTime").textContent = fmtTime(at);
  $("glDate").textContent = fmtDate(at);
  const place = await getPlace();
  applyTheme(place);
  $("ask").hidden = !!place;
  $("glSun").hidden = !place;
  if (!place) { $("glWx").hidden = true; $("glRadar").hidden = true; return; }

  // The small arc is a picture, not a chart: the sun crosses the top from sunrise to sunset, and
  // a moon crosses underneath from sunset to sunrise.
  const { lat, lon } = place;
  const t = sunTimes(at, lat, lon), sun = sunPosition(at, lat, lon);
  const up = sun.altitude > -0.833, morning = at < t.noon;
  let f = 0.5;
  if (up && t.sunrise && t.sunset) f = (at - t.sunrise) / (t.sunset - t.sunrise);
  if (!up) {
    const from = morning ? sunTimes(new Date(+at - DAY_MS), lat, lon).sunset : t.sunset;
    const to = morning ? t.sunrise : sunTimes(new Date(+at + DAY_MS), lat, lon).sunrise;
    if (from && to) f = (at - from) / (to - from);
  }
  const p = along($(up ? "glArc" : "glNight"), f);
  const dot = $("glDot");
  dot.setAttribute("cx", p.x);
  dot.setAttribute("cy", p.y);
  dot.setAttribute("class", up ? "gl-sun-dot" : "gl-moon-dot");
  dot.style.fill = up ? skyColors(sun.altitude, false).sun : "";
  $("glDone").style.display = !up && morning ? "none" : "";
  $("glDone").style.strokeDasharray = `${up ? f : 1} 1`;
  $("glRise").textContent = `↑ ${fmtTime(t.sunrise)}`;
  $("glSet").textContent = `↓ ${fmtTime(t.sunset)}`;
  // The moon's phase rides on the same line, with its name for anyone who points at it.
  const phase = moonPhase(at);
  $("glMoon").textContent = phase.emoji;
  $("glMoon").title = `${phase.name}, ${Math.round(phase.fraction * 100)}% lit`;
  const next = nextLight(at, lat, lon);
  $("glLeft").textContent = next ? `${cap(next.label)} in ${span(next.at - at)}` : lightPhase(sun.altitude);

  const wx = await cachedWeather(place);
  const img = $("glRadarImg");
  const src = wx && wx.station ? radarUrl(wx.station, "0") : "";
  $("glWx").hidden = !wx;
  $("glRadar").hidden = !src || img.dataset.failed === src;
  // With a place and no forecast, the strip says why where the weather would be.
  const { wxWhy } = wx ? {} : await chrome.storage.local.get("wxWhy");
  const why = wxWhy && wxWhy.key === placeKey(place) ? wxWhy : null;
  $("glWhy").hidden = !why;
  if (why) $("glWhy").textContent = why.abroad ? "No forecast or radar here: they come from the National Weather Service, which covers the United States." : `The forecast didn't load (${why.said}). It tries again on the next new tab.`;
  if (!wx) return;
  const { now, today } = nowOf(wx);
  $("glGlyph").textContent = glyph(now.text, now.day, moonPhase(at).emoji);
  $("glTemp").textContent = `${now.temp}°`;
  $("glText").textContent = now.text;
  $("glHiLo").textContent = [today.hi != null && `${today.hi}° high`, today.lo != null && `${today.lo}° low`, now.pop >= 20 && `${now.pop}% rain`].filter(Boolean).join(", ");
  if (src && img.src !== src) {
    img.onerror = () => { img.dataset.failed = src; $("glRadar").hidden = true; };
    img.src = src;
  }
}
