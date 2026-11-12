// Where you are. It is never assumed: the first new tab asks the computer, and if the computer
// can't say, the page asks you. Until there is an answer nothing that needs a place is drawn.
// It stays in this browser's local storage, rounded to about a kilometre.
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

// Why the computer's location didn't come back, by the browser's error code, in words that say
// what to do next. Chrome shows no location prompt on a new tab page, so the extension holds the
// permission itself; what is left to refuse is the operating system.
const WHY = {
  1: "Chrome isn't allowed to see this computer's location. On a Mac, turn on Google Chrome under System Settings → Privacy & Security → Location Services, then press the button again. Or type a place.",
  2: "This computer couldn't work out where it is: its location service is off, or there is no Wi-Fi to place it by. Type a place instead.",
  3: "Finding this computer took too long. Press the button to try again, or type a place.",
};
function locate() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lon: round(p.coords.longitude) }),
      (err) => reject(new Error(WHY[err.code] || WHY[2])),
      { timeout: 10000, maximumAge: RELOCATE_MS },
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

// The place search is OpenStreetMap's Nominatim. Its usage policy allows a search a person asks
// for and forbids searching as they type, so this runs once per press of Search.
// https://operations.osmfoundation.org/policies/nominatim/ (checked 2026-11-11)
// Whatever was typed (a city, a postal code, a street address), each hit is named by the town it
// is in, since the town is all the forecast needs; hits in the same town become one.
export async function searchPlaces(q) {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.search = new URLSearchParams({ format: "jsonv2", limit: "8", addressdetails: "1", "accept-language": navigator.language, q });
  let r;
  try { r = await fetch(u); } catch { throw new Error("Couldn't reach the place search. Check the connection and try again."); }
  if (!r.ok) throw new Error(`The place search answered ${r.status}. Try again in a moment.`);
  const hits = await r.json();
  // A bare postal code exists in many countries; put this browser's own country first.
  const home = (new Intl.Locale(navigator.language).region || "").toLowerCase();
  if (/^\d[\d -]*$/.test(q)) hits.sort((x, y) => (y.address?.country_code === home) - (x.address?.country_code === home));
  const seen = new Set();
  return hits.map((hit) => {
    const a = hit.address || {};
    const town = a.city || a.town || a.village || a.hamlet || a.municipality || a.county || hit.name;
    const parts = [town, a.state || a.region, a.country_code === "us" ? "" : a.country].filter((part, i, all) => part && all.indexOf(part) === i);
    const name = parts.join(", ") || hit.display_name;
    return { name, label: hit.addresstype === "postcode" && a.postcode ? `${a.postcode} · ${name}` : name, lat: round(hit.lat), lon: round(hit.lon) };
  }).filter((hit) => !seen.has(hit.name) && seen.add(hit.name)).slice(0, 5);
}

// The two ways to say where you are, as one small form. `onDone` gets the place that was set.
// The box it returns has `locate()`, which is the button's press, for the first run to call.
export function placeForm(onDone) {
  const box = el("div", "place-form");
  const device = el("button", "btn", "Use this computer's location");
  device.type = "button";
  const form = el("form");
  const input = el("input");
  input.placeholder = "or type a city, ZIP or address";
  input.setAttribute("aria-label", "Place");
  input.required = true;
  const go = el("button", "btn", "Search");
  go.type = "submit";
  form.append(input, go);
  const msg = el("p", "note");
  msg.setAttribute("role", "status");
  const hits = el("ul", "place-hits");
  const say = (text) => { msg.textContent = text; msg.hidden = !text; };
  say("");
  const choose = async (hit) => {
    hits.replaceChildren();
    input.value = "";
    say("");
    onDone(await save({ name: hit.name, lat: hit.lat, lon: hit.lon, source: "typed", at: Date.now() }));
  };

  // `byHand` is a press of the button; the first run calls this itself and must not pull the
  // cursor out of the address bar.
  box.locate = async (byHand) => {
    hits.replaceChildren();
    say("Finding this computer…");
    try { onDone(await useDevice()); say(""); } catch (err) { say(err.message); if (byHand) input.focus(); }
  };
  device.onclick = () => box.locate(true);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    hits.replaceChildren();
    say("Searching…");
    try {
      const found = await searchPlaces(q);
      if (!found.length) return say(`Nothing found for “${q}”. Try a city and state, or a ZIP code.`);
      // One answer needs no choosing.
      if (found.length === 1) return choose(found[0]);
      say("Which one?");
      hits.replaceChildren(...found.map((hit) => {
        const b = el("button", "mini", hit.label);
        b.type = "button";
        b.onclick = () => choose(hit);
        const li = el("li");
        li.append(b);
        return li;
      }));
    } catch (err) { say(err.message); }
  };
  box.append(device, form, msg, hits, el("p", "cap", "Place search © OpenStreetMap contributors"));
  return box;
}
