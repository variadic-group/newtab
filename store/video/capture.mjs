// Steps comp.html through the film and writes one JPEG per frame.
//   node capture.mjs <scenes.json> <outDir>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const [config, out] = process.argv.slice(2);
const film = JSON.parse(fs.readFileSync(config, "utf8"));
const base = path.dirname(path.resolve(config));
const url = (f) => pathToFileURL(path.resolve(base, f)).href;
for (const s of film.scenes) { if (s.img) s.img = url(s.img); if (s.side) s.side = url(s.side); }
if (film.icon) film.icon = url(film.icon);
const FPS = 30;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--allow-file-access-from-files", "--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.addInitScript((film) => { window.FILM = film; }, film);
await page.goto(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), "comp.html")).href, { waitUntil: "load" });
await page.evaluate(() => window.ready);
const frames = Math.round(film.duration * FPS);
for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.render(t), i / FPS);
  await page.screenshot({ path: path.join(out, `f${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 92 });
}
await browser.close();
