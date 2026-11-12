// Where you are. It is asked for, never assumed: until you answer, nothing that needs a place is
// drawn. It stays in this browser's local storage, rounded to about a kilometre.
import { el } from "./dom.js";

const RELOCATE_MS = 6 * 3600e3;
const round = (n) => +(+n).toFixed(2);

export const placeKey = (p) => `${p.lat},${p.lon}`;
export async function getPlace() {
  return (await chrome.storage.local.get("place")).place || null;
}
async function save(place) {
  await chrome.storage.local.set({ place });
  return place;
}

function locate() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lon: round(p.coords.longitude) }),
      (err) => reject(new Error(err.code === 1
        ? "Chrome isn't allowed to use this computer's location. On a Mac that is System Settings → Privacy & Security → Location Services → Google Chrome. Or type a city."
        : "This computer's location didn't come back. Try again, or type a city.")),
      { timeout: 15000, maximumAge: RELOCATE_MS },
    );
  });
}

// A place taken from the computer has no name of its own; the forecast names it.
export async function useDevice() {
  return save({ ...(await locate()), source: "device", at: Date.now() });
}

// A place taken from the computer follows it, checked again after six hours; one you typed stays
// put. Resolves with the new place only when the computer has moved.
export async function deviceMoved(place) {
  if (place.source !== "device" || Date.now() - place.at < RELOCATE_MS) return null;
  let here;
  try { here = await locate(); } catch (err) { console.warn("location:", err.message); return null; }
  const moved = here.lat !== place.lat || here.lon !== place.lon;
  await save({ ...here, source: "device", at: Date.now() });
  return moved ? getPlace() : null;
}

// City search is OpenStreetMap's Nominatim. Its usage policy allows a search a person asks for
// and forbids searching as they type, so this runs once per press of Search.
// https://operations.osmfoundation.org/policies/nominatim/ (checked 2026-11-11)
export async function searchPlaces(q) {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.search = new URLSearchParams({ format: "jsonv2", limit: "5", addressdetails: "1", "accept-language": navigator.language, q });
  const r = await fetch(u);
  if (!r.ok) throw new Error(`The city search answered ${r.status}. Try again in a moment.`);
  return (await r.json()).map((hit) => {
    const a = hit.address || {};
    const parts = [hit.name, a.state, a.country].filter((p, i, all) => p && all.indexOf(p) === i);
    return { name: parts.join(", ") || hit.display_name, lat: round(hit.lat), lon: round(hit.lon) };
  });
}

// The two ways to say where you are, as one small form. `onDone` gets the place that was set.
export function placeForm(onDone) {
  const box = el("div", "place-form");
  const device = el("button", "btn", "Use this computer's location");
  device.type = "button";
  const form = el("form");
  const input = el("input");
  input.placeholder = "or type a city";
  input.setAttribute("aria-label", "City");
  input.required = true;
  const go = el("button", "btn", "Search");
  go.type = "submit";
  form.append(input, go);
  const msg = el("p", "note");
  msg.setAttribute("role", "status");
  const hits = el("ul", "place-hits");
  const say = (text) => { msg.textContent = text; msg.hidden = !text; };
  say("");

  device.onclick = async () => {
    hits.replaceChildren();
    say("Finding this computer…");
    try { onDone(await useDevice()); say(""); } catch (err) { say(err.message); }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    hits.replaceChildren();
    say("Searching…");
    try {
      const found = await searchPlaces(input.value.trim());
      say(found.length ? "" : "No place by that name. Try the city and the state or country.");
      hits.replaceChildren(...found.map((hit) => {
        const b = el("button", "mini", hit.name);
        b.type = "button";
        b.onclick = async () => { onDone(await save({ ...hit, source: "typed", at: Date.now() })); hits.replaceChildren(); input.value = ""; };
        const li = el("li");
        li.append(b);
        return li;
      }));
    } catch (err) { say(err.message); }
  };
  box.append(device, form, msg, hits, el("p", "cap", "City search © OpenStreetMap contributors"));
  return box;
}
