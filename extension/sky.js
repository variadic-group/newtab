// Where the sun and the moon are, and what the sky looks like because of it. No page, no browser:
// every function here takes a time and a place and returns numbers, so it runs and is tested in
// Node. Angles go in and come out in degrees unless a name says otherwise.
//
// The astronomy is SunCalc's (https://github.com/mourner/suncalc), © Volodymyr Agafonkin,
// BSD 2-Clause; its licence is in THIRD-PARTY.md beside this file.

const rad = Math.PI / 180;
const dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, J0 = 0.0009;
const e = rad * 23.4397; // obliquity of the Earth

const toDays = (date) => date.valueOf() / dayMs - 0.5 + J1970 - J2000;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI)); // into −π…π

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const altitudeOf = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
const refraction = (h) => 0.0002967 / Math.tan(Math.max(h, 0) + 0.00312536 / (Math.max(h, 0) + 0.08901179));

const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
}
function sunCoords(d) {
  const L = eclipticLongitude(solarMeanAnomaly(d));
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}
function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

// `hourAngle` is how far the body is from due south (north, below the equator), as a fraction of
// a turn: 0 on the meridian where it stands highest, −0.25 six hours before, +0.25 six after.
export function sunPosition(date, lat, lon) {
  const d = toDays(date), c = sunCoords(d), H = wrap(siderealTime(d, rad * -lon) - c.ra);
  return { altitude: altitudeOf(H, rad * lat, c.dec) / rad, hourAngle: H / (2 * Math.PI) };
}

// `tilt` is which way the lit edge faces as you look up at it: degrees anticlockwise from straight up.
export function moonPosition(date, lat, lon) {
  const d = toDays(date), phi = rad * lat, c = moonCoords(d), H = wrap(siderealTime(d, rad * -lon) - c.ra);
  const h = altitudeOf(H, phi, c.dec);
  const parallactic = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(c.dec) - Math.sin(c.dec) * Math.cos(H));
  return { altitude: (h + refraction(h)) / rad, hourAngle: H / (2 * Math.PI), tilt: (moonPhase(date).angle - parallactic) / rad };
}

// `fraction` of the disc is lit; `phase` runs 0 (new) → 0.25 (first quarter) → 0.5 (full) → 1.
export function moonPhase(date) {
  const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sunDist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sunDist * Math.sin(phi), m.dist - sunDist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  const phase = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;
  return { fraction: (1 + Math.cos(inc)) / 2, phase, angle, name: PHASES[Math.round(phase * 8) % 8][0], emoji: PHASES[Math.round(phase * 8) % 8][1] };
}
const PHASES = [["New moon", "🌑"], ["Waxing crescent", "🌒"], ["First quarter", "🌓"], ["Waxing gibbous", "🌔"], ["Full moon", "🌕"], ["Waning gibbous", "🌖"], ["Last quarter", "🌗"], ["Waning crescent", "🌘"]];

// The moments the sun crosses each height, for the solar day (solar midnight to solar midnight)
// that `date` falls in. A crossing that doesn't happen that day, as in a polar summer, is null.
const CROSSINGS = { sunrise: -0.833, dawn: -6, nauticalDawn: -12, firstLight: -18, goldenEnd: 6 };
const EVENING = { sunrise: "sunset", dawn: "dusk", nauticalDawn: "nauticalDusk", firstLight: "lastLight", goldenEnd: "golden" };
export function sunTimes(date, lat, lon) {
  const lw = rad * -lon, phi = rad * lat;
  const n = Math.round(toDays(date) - J0 - lw / (2 * Math.PI));
  const transit = (Ht) => {
    const ds = J0 + (Ht + lw) / (2 * Math.PI) + n, M = solarMeanAnomaly(ds), L = eclipticLongitude(M);
    return { j: J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L), dec: declination(L, 0) };
  };
  const noon = transit(0);
  const out = { noon: fromJulian(noon.j), midnight: fromJulian(noon.j - 0.5) };
  for (const [morning, deg] of Object.entries(CROSSINGS)) {
    const w = Math.acos((Math.sin(deg * rad) - Math.sin(phi) * Math.sin(noon.dec)) / (Math.cos(phi) * Math.cos(noon.dec)));
    const set = Number.isNaN(w) ? null : transit(w).j;
    out[morning] = set === null ? null : fromJulian(noon.j - (set - noon.j));
    out[EVENING[morning]] = set === null ? null : fromJulian(set);
  }
  return out;
}

// When the moon next rises and sets, looking a day ahead of `date` (after SunCalc's getMoonTimes).
export function moonTimes(date, lat, lon) {
  const h0 = 0.133 * rad, at = (hours) => moonPosition(new Date(+date + hours * 3600e3), lat, lon).altitude * rad - h0;
  let rise = null, set = null, before = at(0);
  for (let i = 1; i <= 24 && !(rise && set); i += 2) {
    const mid = at(i), after = at(i + 1);
    const a = (before + after) / 2 - mid, b = (after - before) / 2, d = b * b - 4 * a * mid;
    if (d >= 0) {
      const x = -b / (2 * a), dx = Math.sqrt(d) / (Math.abs(a) * 2);
      for (const root of [x - dx, x + dx]) {
        if (Math.abs(root) > 1) continue;
        const when = new Date(+date + (i + root) * 3600e3);
        // Rising when the height is climbing through zero at that root.
        if (2 * a * root + b > 0) rise = rise || when; else set = set || when;
      }
    }
    before = after;
  }
  return { rise, set };
}

// What the light is doing, by the sun's height.
export function lightPhase(altitude) {
  if (altitude >= 6) return "Daylight";
  if (altitude >= -0.833) return "Golden hour";
  if (altitude >= -6) return "Civil twilight";
  if (altitude >= -12) return "Nautical twilight";
  if (altitude >= -18) return "Astronomical twilight";
  return "Night";
}

// The next change of light worth naming, and when.
const NEXT = [["firstLight", "first light"], ["dawn", "dawn"], ["sunrise", "sunrise"], ["golden", "golden hour"], ["sunset", "sunset"], ["dusk", "dusk"], ["lastLight", "full dark"]];
export function nextLight(date, lat, lon) {
  for (const day of [date, new Date(+date + dayMs)]) {
    const t = sunTimes(day, lat, lon);
    for (const [key, label] of NEXT) if (t[key] && t[key] > date) return { label, at: t[key] };
  }
  return null;
}

// The night that `date` is in or heading into: from dusk to the next dawn. Null where the sun
// doesn't cross −6° that day (a polar summer or winter).
export function nightSpan(date, lat, lon) {
  const today = sunTimes(date, lat, lon);
  if (!today.dawn || !today.dusk) return null;
  if (date < today.dawn) {
    const y = sunTimes(new Date(+date - dayMs), lat, lon);
    return y.dusk ? { from: y.dusk, to: today.dawn } : null;
  }
  const t = sunTimes(new Date(+date + dayMs), lat, lon);
  return t.dawn ? { from: today.dusk, to: t.dawn } : null;
}

// ---------- colour ----------
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
// Reads a colour off a list of [height, colour…] stops, highest first.
function ramp(stops, altitude, col) {
  if (altitude >= stops[0][0]) return stops[0][col];
  for (let i = 1; i < stops.length; i++) {
    if (altitude >= stops[i][0]) return mix(stops[i][col], stops[i - 1][col], (altitude - stops[i][0]) / (stops[i - 1][0] - stops[i][0]));
  }
  return stops[stops.length - 1][col];
}
// [sun height, top of the sky, sky at the horizon]. The two lists meet at −6°, where the page
// itself turns dark, so nothing jumps at that moment.
const NIGHT = [[-6, "#2c3a72", "#b0688c"], [-12, "#151d49", "#3b3a78"], [-18, "#0b1026", "#141a36"]];
const SKY = {
  light: [[20, "#cfe6fb", "#eef6fd"], [6, "#bcd4f2", "#ffe2b8"], [0, "#8fa6dd", "#ffb98a"], ...NIGHT],
  dark: [[20, "#1d3557", "#3f6d9e"], [6, "#243a66", "#a8744a"], [0, "#2a3a70", "#b8684c"], ...NIGHT],
};
const SUN = [[25, "#f7b500"], [8, "#f59e0b"], [0, "#f0642a"], [-8, "#b94a3c"]];

// The sky's two colours for a sun height, how visible the stars are (0…1), whether text on it
// should be light, and the sun's own colour.
export function skyColors(altitude, dark) {
  const stops = SKY[dark ? "dark" : "light"];
  return {
    top: ramp(stops, altitude, 1),
    horizon: ramp(stops, altitude, 2),
    stars: Math.min(1, Math.max(0, (-altitude - 6) / 10)),
    lightInk: dark || altitude < -3,
    sun: ramp(SUN, altitude, 1),
  };
}
