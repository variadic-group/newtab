// Places: where you are, and the cities you keep an eye on. Where you are is the place the
// page is set to (place.js); it decides light and dark and what Tools measures from. One place
// is looked at, at a time: where you are, or a city picked from the row. The sky, the forecast
// and the strip at the top of every space are drawn for the one being looked at, in its own
// time. Adding a city looks its name up (OpenStreetMap) and asks which time zone that spot is
// in (BigDataCloud), both only when you press Add.
import { $, el } from "./dom.js";
import { getPlace, searchPlaces } from "./place.js";

const MAX = 8;
export const cities = async () => (await chrome.storage.sync.get("zones")).zones || [];
const viewed = async () => (await chrome.storage.local.get("view")).view || null;
// The place being looked at: a city if one is picked, else where you are.
export async function shownPlace() {
  return (await viewed()) || (await getPlace());
}
const pick = (city) => (city ? chrome.storage.local.set({ view: { name: city.name, lat: city.lat, lon: city.lon, tz: city.zone } }) : chrome.storage.local.remove("view"));
const clock = (at, zone) => new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(at);
// The day too, when it isn't today's here: the other side of the world is often on another one.
const dayIf = (at, zone) => {
  const there = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(at), here = new Intl.DateTimeFormat("en-CA").format(at);
  return there === here ? "" : `${new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: "short" }).format(at)} `;
};
const town = (name) => name.split(",")[0];
const is = (view, city) => !!view && view.lat === city.lat && view.lon === city.lon;

function chip(label, time, on, run) {
  const b = el("button", "place");
  b.type = "button";
  b.setAttribute("aria-pressed", String(on));
  b.append(el("span", "p-name", label));
  if (time) b.append(el("b", null, time));
  b.onclick = run;
  return b;
}

// The row on Today and the smaller one in the strip on every space, for one moment: now, or
// wherever the day has been dragged to.
export async function renderPlaces(at = new Date()) {
  const [view, list, home] = await Promise.all([viewed(), cities(), getPlace()]);
  const row = (small) => {
    if (!list.length) return [];
    const here = chip(small ? "Here" : `📍 ${home && home.name ? town(home.name) : "Here"}`, small ? "" : clock(at), !view, () => pick(null));
    here.title = "Where you are";
    return [here, ...list.map((c) => {
      const b = chip(town(c.name), `${dayIf(at, c.zone)}${clock(at, c.zone)}`, is(view, c), () => pick(is(view, c) ? null : c));
      b.title = `${c.name}. Press to see its sky and forecast.`;
      if (small) return b;
      const gone = el("button", "x edit-only", "×");
      gone.type = "button";
      gone.setAttribute("aria-label", `Remove ${c.name}`);
      gone.onclick = async () => {
        if (is(view, c)) await pick(null);
        await chrome.storage.sync.set({ zones: (await cities()).filter((z) => !is(z, c)) });
      };
      const wrap = el("span", "place-wrap");
      wrap.append(b, gone);
      return wrap;
    })];
  };
  $("places").replaceChildren(...row(false));
  // The strip has room for three lines. The city being looked at is always one of them, and
  // "Here" is offered only while a city is, as the way back.
  const [here, ...rest] = row(true);
  const on = rest.find((b) => b.getAttribute("aria-pressed") === "true");
  const lines = rest.slice(0, view ? 2 : 3);
  if (on && !lines.includes(on)) lines[lines.length - 1] = on;
  $("glZones").replaceChildren(...(view ? [here] : []), ...lines);
  $("glZones").hidden = !list.length;
  $("zoneAdd").hidden = list.length >= MAX;
}

// Which time zone a spot on Earth is in.
async function zoneAt({ lat, lon }) {
  const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`the time zone lookup answered ${r.status}`);
  const d = await r.json();
  const zone = ((d.localityInfo || {}).informative || []).find((x) => x && x.description === "time zone");
  if (!zone) throw new Error("no time zone came back for that place");
  clock(new Date(), zone.name); // throws unless this browser can keep time in it
  return zone.name;
}

export function wirePlaces() {
  $("zoneForm").onsubmit = async (e) => {
    e.preventDefault();
    const q = $("zoneInput").value.trim();
    if (!q) return;
    $("zoneNote").textContent = "Looking it up…";
    try {
      const [hit] = await searchPlaces(q);
      if (!hit) { $("zoneNote").textContent = `Nothing found for “${q}”.`; return; }
      const city = { name: hit.name, lat: hit.lat, lon: hit.lon, zone: await zoneAt(hit) };
      const all = await cities();
      if (!all.some((z) => is(z, city))) await chrome.storage.sync.set({ zones: [...all, city].slice(0, MAX) });
      await pick(city);
      $("zoneInput").value = "";
      $("zoneNote").textContent = "";
    } catch (err) { console.warn("places:", err.message); $("zoneNote").textContent = `That didn't work: ${err.message}.`; }
  };
}
