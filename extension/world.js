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
