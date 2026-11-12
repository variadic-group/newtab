// The world on Today: which side of it is in daylight at the moment the page is showing, and
// what time it is in the places you have added. Adding a place looks its name up (OpenStreetMap)
// and asks which time zone that spot is in (BigDataCloud); both only when you press Add.
import { $, el } from "./dom.js";
import { CELLS, dots, spot, svg, MAP } from "./world.js";
import { sunPosition } from "./sky.js";
import { getPlace, searchPlaces } from "./place.js";

const saved = async () => (await chrome.storage.sync.get("zones")).zones || [];
// A clock with its day, since the other side of the world is often on another one. No zone
// means this computer's.
const clockIn = (at, zone) => new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(at);

function pin(cls, at, name) {
  const [x, y] = spot(at);
  const g = svg("g", { class: `pin ${cls}` });
  const left = x > MAP.w - name.length * 10 - 20;
  g.append(svg("circle", { class: "dot", cx: x, cy: y, r: 6.5 }), svg("text", { x: x + (left ? -11 : 11), y: y + 6, "text-anchor": left ? "end" : "start" }, name));
  return g;
}

// Draws the map and the list for one moment: now, or wherever the day has been dragged to.
export async function renderWorld(at, then = false, name = "") {
  const [place, zones] = await Promise.all([getPlace(), saved()]);
  $("worldSay").textContent = then ? `The world at ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} your time` : "The world right now";
  const lit = [], dark = [];
  for (const c of CELLS) (sunPosition(at, c.lat, c.lon).altitude > 0 ? lit : dark).push(c);
  $("worldDay").setAttribute("d", dots(lit));
  $("worldNight").setAttribute("d", dots(dark));
  $("worldMap").setAttribute("aria-label", `Daylight covers ${Math.round((lit.length / CELLS.length) * 100)}% of the land`);
  $("worldPins").replaceChildren(...(place ? [pin("you", place, "You")] : []), ...zones.map((z) => pin("there", z, z.name.split(",")[0])));
  const here = el("li", "here");
  if (place) here.append(el("b", null, clockIn(at)), el("span", "where", name ? `${name}, where you are` : "Where you are"));
  $("zones").replaceChildren(...(place ? [here] : []), ...zones.map((z, i) => {
    const li = el("li");
    const gone = el("button", "mini", "Remove");
    gone.type = "button";
    gone.setAttribute("aria-label", `Remove ${z.name}`);
    gone.onclick = async () => { const all = await saved(); all.splice(i, 1); await chrome.storage.sync.set({ zones: all }); };
    li.append(el("b", null, clockIn(at, z.zone)), el("span", "where", z.name), gone);
    return li;
  }));
  $("zoneHint").hidden = zones.length > 0;
}

// Which time zone a spot on Earth is in.
async function zoneAt({ lat, lon }) {
  const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`the time zone lookup answered ${r.status}`);
  const d = await r.json();
  const zone = ((d.localityInfo || {}).informative || []).find((x) => x && x.description === "time zone");
  // Only a name this browser can keep time in is any use.
  if (zone) clockIn(new Date(), zone.name);
  if (!zone) throw new Error("no time zone came back for that place");
  return zone.name;
}

let wired = false;
export function wireZones() {
  if (wired) return;
  wired = true;
  $("zoneForm").onsubmit = async (e) => {
    e.preventDefault();
    const q = $("zoneInput").value.trim();
    if (!q) return;
    $("zoneNote").textContent = "Looking it up…";
    try {
      const [hit] = await searchPlaces(q);
      if (!hit) { $("zoneNote").textContent = `Nothing found for “${q}”.`; return; }
      const zone = await zoneAt(hit);
      const all = await saved();
      if (!all.some((z) => z.name === hit.name)) await chrome.storage.sync.set({ zones: [...all, { name: hit.name, lat: hit.lat, lon: hit.lon, zone }].slice(0, 8) });
      $("zoneInput").value = "";
      $("zoneNote").textContent = "";
    } catch (err) { console.warn("zones:", err.message); $("zoneNote").textContent = `That didn't work: ${err.message}.`; }
  };
}
