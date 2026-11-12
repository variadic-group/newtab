// The dotted map of the world, shared by the Tools page and Today: six units to a cell, north at
// the top, 180° west at the left.
import { LAND } from "./land.js";

const NS = "http://www.w3.org/2000/svg";
export const svg = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};
export const CELL = 6;
export const MAP = { w: LAND.cols * CELL, h: LAND.rows * CELL };
export const spot = ({ lat, lon }) => [((lon + 180) / 360) * MAP.w, ((LAND.top - lat) / (LAND.rows * LAND.step)) * MAP.h];

// Every cell of land: where it is drawn, and where on Earth its middle is.
export const CELLS = (() => {
  const bytes = Uint8Array.from(atob(LAND.bits), (c) => c.charCodeAt(0));
  const out = [];
  for (let i = 0; i < LAND.cols * LAND.rows; i++) {
    if (!((bytes[i >> 3] >> (i & 7)) & 1)) continue;
    const col = i % LAND.cols, row = Math.floor(i / LAND.cols);
    out.push({ x: col * CELL + CELL / 2, y: row * CELL + CELL / 2, lat: LAND.top - (row + 0.5) * LAND.step, lon: -180 + (col + 0.5) * LAND.step });
  }
  return out;
})();
// Cells as one path of round dots.
export const dots = (cells) => cells.map((c) => `M${c.x} ${c.y}h0`).join("");

// Where on Earth the sun is straight overhead at `at`: its declination and the longitude where it
// is noon. Good to a fraction of a degree, which is less than a cell.
export function overhead(at) {
  const n = (+at - Date.UTC(2000, 0, 1, 12)) / 864e5, r = Math.PI / 180;
  const g = (357.528 + 0.9856003 * n) * r;
  const along = (280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * r;
  const tilt = (23.439 - 4e-7 * n) * r;
  const ra = Math.atan2(Math.cos(tilt) * Math.sin(along), Math.cos(along)) / r;
  const lon = (((ra - (280.46061837 + 360.98564736629 * n)) % 360) + 540) % 360 - 180;
  return { lat: Math.asin(Math.sin(tilt) * Math.sin(along)) / r, lon };
}
// The land in daylight and the land in the dark at `at`.
export function daylight(at) {
  const sun = overhead(at), r = Math.PI / 180, lit = [], dark = [];
  for (const c of CELLS) {
    const up = Math.sin(c.lat * r) * Math.sin(sun.lat * r) + Math.cos(c.lat * r) * Math.cos(sun.lat * r) * Math.cos((c.lon - sun.lon) * r);
    (up > 0 ? lit : dark).push(c);
  }
  return { lit, dark, sun };
}
// A small sun drawn where it is overhead.
export function sunMark(sun, cls = "sun-over") {
  const [x, y] = spot(sun);
  const g = svg("g", { class: cls });
  let rays = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
    rays += `M${(x + 10 * c).toFixed(1)} ${(y + 10 * s).toFixed(1)}L${(x + 15 * c).toFixed(1)} ${(y + 15 * s).toFixed(1)}`;
  }
  g.append(svg("title", {}, "The sun is straight overhead here"), svg("path", { class: "rays", d: rays }), svg("circle", { class: "core", cx: x, cy: y, r: 6.5 }));
  return g;
}
