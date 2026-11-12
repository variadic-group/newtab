// Where you are. It is never assumed. The first new tab asks the computer; if the computer won't
// say, the city is estimated from the network connection and the page says so; if that fails
// too, or the network is plainly somewhere else (a VPN), the page asks you. The place stays in this browser's local storage, rounded to about a
// kilometre.
import { el } from "./dom.js";

// On a Mac the switch that lets Chrome know where the computer is lives in System Settings.
// Chrome asks before it hands a link like this to another app.
const MAC = /Mac/.test(navigator.userAgent);
const MAC_LOCATION = "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices";

const RELOCATE_MS = 6 * 3600e3;
const RETRY_MS = 15 * 60e3;
const round = (n) => +(+n).toFixed(2);
// The computer's own time zone. Every place is saved with the zone it was set in, so a change
// of zone says the computer has travelled, with nothing asked of anyone.
const zoneNow = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const placeKey = (p) => `${p.lat},${p.lon}`;
export async function getPlace() {
  return (await chrome.storage.local.get("place")).place || null;
}
async function save(place) {
  const { asked, tried, ...rest } = place;
  const saved = { ...rest, zone: zoneNow() };
  await chrome.storage.local.set({ place: saved });
  return saved;
}

// Why the computer's own location didn't come back, by the browser's error code. Chrome shows
// no location prompt on a new tab page, so the extension holds the permission itself; what is
// left to refuse is the operating system.
const WHY = {
  1: MAC
    ? "Chrome isn't allowed to see this computer's location. Switch on Google Chrome under System Settings → Privacy & Security → Location Services. If Chrome isn't in that list, open Google Maps in Chrome and press “Show your location” once: the Mac then asks whether Chrome may know, and this page can too."
    : "Chrome isn't allowed to see this computer's location: switch on location for Chrome in the computer's own settings.",
  2: MAC
    ? "This computer couldn't work out where it is. On a Mac that usually means Location Services hasn't let Chrome in yet (System Settings → Privacy & Security → Location Services), or Wi-Fi is off: Macs place themselves by the Wi-Fi networks around them."
    : "This computer couldn't work out where it is (its location service is off, or there is no Wi-Fi to place it by).",
  3: "Finding this computer took too long.",
};
function exact() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lon: round(p.coords.longitude), source: "device" }),
      (err) => reject(new Error(WHY[err.code] || WHY[2])),
      { timeout: 10000, maximumAge: RELOCATE_MS },
    );
  });
}

// How far a named time zone's clock is from UTC right now, in minutes, or null for a name this
// browser doesn't know.
export function offsetOf(zone) {
  try {
    const text = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName").value;
    const m = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(text);
    if (!m) return null;
    return m[1] ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0;
  } catch { return null; } // an unknown zone name: nothing to compare with
}

// The city this network connection appears to be in. BigDataCloud's free client-side API needs
// no key and, given no coordinates, places the caller by IP address.
// https://www.bigdatacloud.com/docs/api/free-reverse-geocode-to-city-api (checked 2026-11-11)
// A VPN puts the connection somewhere you are not. The answer names its time zone, so when that
// zone's clock differs from this computer's the city is not used: `say` is what to tell you.
async function estimate() {
  let d;
  try {
    const r = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en", { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`the estimate answered ${r.status}`);
    d = await r.json();
    if (typeof d.latitude !== "number" || typeof d.longitude !== "number") throw new Error("the estimate had no position in it");
  } catch (err) {
    throw Object.assign(err, { say: "Its network couldn't be placed either, so type a place." });
  }
  const city = d.city || d.locality;
  const name = [city, d.principalSubdivision === city ? "" : d.principalSubdivision, d.countryCode === "US" ? "" : (d.countryName || "").replace(/ \(the\)$/, "")].filter(Boolean).join(", ");
  const zone = ((d.localityInfo || {}).informative || []).find((x) => x && x.description === "time zone");
  const there = zone ? offsetOf(zone.name) : null;
  if (there !== null && there !== -new Date().getTimezoneOffset()) {
    throw Object.assign(new Error(`the network is in ${zone.name}, not this computer's time zone`), { say: `Its network looks like it is in ${name || "another time zone"}, which isn't this computer's time zone (a VPN does that), so type a place.` });
  }
  return { lat: round(d.latitude), lon: round(d.longitude), name, source: "network" };
}

// Where this computer is: exactly if it will say, else roughly from its network, with the
// reason the exact answer was refused kept beside it. A place found exactly has no name of its
// own; the forecast names it.
async function thisComputer() {
  try {
    return await exact();
  } catch (refused) {
    try {
      return { ...(await estimate()), why: refused.message };
    } catch (err) {
      console.warn("location estimate:", err.message);
      throw new Error(`${refused.message} ${err.say}`);
    }
  }
}

// Could this place be where the computer is? One the computer gave is. One that was typed is
// taken for it unless its sun time is hours off this computer's clock: Paris, on a clock set to
// California, is somewhere that was looked up.
// The clock's standard time is used, so summer time doesn't move the answer.
const standardOffset = () => { const y = new Date().getFullYear(); return Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset()); };
export const couldBeHere = (place) => place.source === "device" || Math.abs(place.lon / 15 + standardOffset() / 60) <= 3.5;

// How a place was found, and what it will do as you travel, in a sentence for Settings.
export function howFound(place) {
  if (place.source === "device") return "Found by this computer. It follows you: looked for again every six hours, and at once when the computer's time zone changes.";
  if (place.source === "network") return `Estimated from your network, so it can be a city or so off. ${place.why || ""} It is looked for again every six hours, and becomes exact once the computer will say. A network in another time zone, as on a VPN, is never used.`.replace(/\s+/g, " ");
  return "Typed by you, so it stays put while you travel. When the computer's time zone changes, the page asks whether it still holds. To follow this computer again, use its location below.";
}

export async function useDevice() {
  return save({ ...(await thisComputer()), at: Date.now() });
}

// A place taken from the computer or its network follows it: looked for again after six hours,
// or at once when the computer's time zone has changed since. One you typed stays put. An exact
// place is only replaced by another exact one (a moment without Wi-Fi must not swap it for a
// guess), unless the time zone says the computer has left it. A look that fails is not repeated
// on every new tab. Resolves with the new place only when it has changed.
export async function placeMoved(place) {
  if (place.source === "typed") return null;
  const travelled = !!place.zone && place.zone !== zoneNow();
  if (Date.now() - Math.max(place.at, place.tried || 0) < (travelled ? RETRY_MS : RELOCATE_MS)) return null;
  let here;
  try {
    here = await (place.source === "device" && !travelled ? exact() : thisComputer());
  } catch (err) {
    console.warn("location:", err.message);
    await chrome.storage.local.set({ place: { ...place, tried: Date.now() } });
    return null;
  }
  const moved = here.lat !== place.lat || here.lon !== place.lon || here.source !== place.source;
  const saved = await save({ ...here, at: Date.now() });
  return moved ? saved : null;
}

// A place you typed never moves by itself. When the computer's time zone has changed since you
// typed it, the page asks whether it still holds: once for each zone the computer turns up in.
// Resolves true when it is time to ask.
export async function leftBehind(place) {
  if (place.source !== "typed") return false;
  const now = zoneNow();
  const keep = (changes) => chrome.storage.local.set({ place: { ...place, ...changes } });
  // Typed before zones were kept: take it as typed here.
  if (!place.zone) { await keep({ zone: now }); return false; }
  if (place.zone === now) { if (place.asked) await keep({ asked: undefined }); return false; }
  if (place.asked === now) return false;
  await keep({ asked: now });
  return true;
}

// The answer "keep it": the typed place now counts as set in the zone the computer is in.
export async function keepPlace() {
  const place = await getPlace();
  if (place) await save(place);
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
    return { name, label: hit.addresstype === "postcode" && a.postcode ? `${a.postcode}, ${name}` : name, lat: round(hit.lat), lon: round(hit.lon) };
  }).filter((hit) => !seen.has(hit.name) && seen.add(hit.name)).slice(0, 5);
}

// The two ways to say where you are, as one small form. `onDone` gets the place that was set,
// and whether a press of the button set it.
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
  const say = (text, toSwitch) => {
    msg.textContent = text;
    msg.hidden = !text;
    if (toSwitch && MAC) {
      const a = el("a", null, "Open Location Services");
      a.href = MAC_LOCATION;
      msg.append(" ", a);
    }
  };
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
    try { onDone(await useDevice(), !!byHand); say(""); } catch (err) { say(err.message, true); if (byHand) input.focus(); }
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
