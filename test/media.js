// The store's captioned images (1280×800) and the README's short demo, made from the real page
// with sample bookmarks and a stubbed forecast. Run: node test/media.js
// Needs ffmpeg for the demo. Captions are set in Inter, which only the images use.
process.env.TZ = "America/New_York";
const { launch, seed, root, nav } = await import("./harness.js");
const fs = await import("node:fs");
const path = await import("node:path");
const { execFileSync } = await import("node:child_process");

const out = path.join(root, "store", "media");
const raw = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "newtab-media-"));
fs.mkdirSync(out, { recursive: true });

const DAY = "2024-06-21T19:30:00Z", NIGHT = "2024-06-22T01:10:00Z";
const { ctx, sw, net, open } = await launch({ icons: "letters", viewport: { width: 1280, height: 800 }, timezoneId: "America/New_York" });
await seed(sw);
await sw.evaluate(() => chrome.storage.local.set({ placeTried: true, place: { lat: 40.71, lon: -74.01, source: "device", at: Date.now() } }));
const view = async (at) => {
  net.at = Date.parse(at);
  await sw.evaluate(() => chrome.storage.local.remove("wx"));
  const page = await open({ at });
  await page.waitForSelector(".card");
  await page.waitForFunction(() => /°/.test(document.getElementById("glTemp").textContent), null, { timeout: 8000 });
  await page.mouse.move(640, 795);
  return page;
};
const snap = async (page, name) => { await page.waitForTimeout(400); const file = path.join(raw, `${name}.png`); await page.screenshot({ path: file }); return file; };

// ---------- the raw views
let page = await view(DAY);
const space = await snap(page, "space");
await page.close();
page = await view(DAY); await nav(page, "Shortcuts"); await page.mouse.move(640, 795);
const short = await snap(page, "short");
await page.close();
page = await view(NIGHT); await nav(page, "Today"); await page.waitForTimeout(900);
const box = await page.locator(".sky-chart").boundingBox();
await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.5);
await page.waitForFunction(() => /^At /.test(document.getElementById("phase").textContent));
const today = await snap(page, "today");
await page.close();
page = await view(DAY); await nav(page, "Tools");
await page.waitForSelector(".ways .way", { timeout: 30000 });
await page.click('.tool:has(h2:has-text("Speed")) .btn'); await page.waitForSelector('.tool:has(h2:has-text("Speed")) .btn:has-text("again"):not([disabled])', { timeout: 30000 });
await page.evaluate(() => scrollTo(0, 0)); await page.mouse.move(640, 795);
const tools = await snap(page, "tools");
await page.close();
const bare = await launch({ icons: "letters", viewport: { width: 1280, height: 800 }, timezoneId: "America/New_York" });
await bare.sw.evaluate(() => chrome.storage.local.set({ placeTried: true, place: { lat: 40.71, lon: -74.01, source: "device", at: Date.now() } }));
bare.net.at = Date.parse(DAY);
page = await bare.open({ at: DAY });
await page.waitForSelector("#empty:not([hidden])");
await page.waitForFunction(() => /°/.test(document.getElementById("glTemp").textContent), null, { timeout: 8000 }).catch(() => {});
await page.mouse.move(640, 795);
const start = await snap(page, "start");
await bare.ctx.close();

// ---------- captioned store images
// One frame: the headline and a line under it, set over the page's own green (or the night sky
// for Today), with the screenshot below, cut off by the bottom edge.
const SHOTS = [
  ["1-your-bookmarks", space, "#0b6e5f", "Your bookmarks are the page.", "Each bookmarks-bar folder becomes a tab of icon tiles. Drag to arrange."],
  ["2-short-links", short, "#0b6e5f", "Type a name. Land there.", "stripe/ opens Stripe. translate/ hola translates. claude/ asks."],
  ["3-today", today, "#17213a", "Your sky, your forecast.", "The sun’s real path, the hourly forecast and radar, for where you are."],
  ["4-tools", tools, "#0b6e5f", "See what your connection gives away.", "VPN, DNS and WebRTC leaks in plain words, plus a speed test."],
  ["5-start", start, "#0b6e5f", "No bookmarks yet? Start in a minute.", "A starter set, your old browser’s bookmarks, or a prompt for your assistant."],
];
const frame = await ctx.newPage();
await frame.setViewportSize({ width: 1280, height: 800 });
for (const [name, file, bg, head, sub] of SHOTS) {
  const img = `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  await frame.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;width:1280px;height:800px;overflow:hidden;background:${bg};font-family:'Inter Display','Inter',sans-serif;color:#fff;position:relative">
    <h1 style="margin:0;position:absolute;left:72px;top:58px;font-weight:700;font-size:54px;letter-spacing:-0.025em;line-height:1.05">${head}</h1>
    <p style="margin:0;position:absolute;left:72px;top:130px;width:900px;font-family:'Inter',sans-serif;font-size:22px;line-height:1.4;opacity:.86">${sub}</p>
    <img src="${img}" style="position:absolute;left:120px;top:222px;width:1040px;border-radius:16px;box-shadow:0 30px 80px rgb(0 0 0 / .38), 0 0 0 1px rgb(255 255 255 / .12)">
  </body>`);
  await frame.waitForTimeout(150);
  await frame.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(name);
}

// ---------- the promo tiles and the store icon
// The mark is drawn, not scaled from the 128 px icon, so it stays sharp at every size. The tiles
// carry the name, the line under it and a slice of the page; the store icon has the 16 px of clear
// border the Chrome Web Store asks for around 96 px of artwork.
const dot = (size) => `<i style="display:block;width:${size * 0.2}px;height:${size * 0.2}px;border-radius:50%;background:#fff"></i>`;
const mark = (size) => `<span style="display:inline-flex;align-items:center;justify-content:center;gap:${size * 0.06}px;width:${size}px;height:${size}px;border-radius:${size * 0.23}px;background:#0b6e5f;flex:none">${dot(size).repeat(3)}</span>`;
const spaceImg = `data:image/png;base64,${fs.readFileSync(space).toString("base64")}`;
const TILES = [
  ["promo-small-440x280", 440, 280, `
    <div style="position:absolute;left:32px;top:34px;display:flex;align-items:center;gap:12px"><span style="border-radius:12px;box-shadow:0 0 0 2px rgb(255 255 255 / .35)">${mark(46)}</span><b style="font-size:32px;letter-spacing:-.02em">New Tab</b></div>
    <p style="position:absolute;left:32px;top:96px;margin:0;font-family:Inter,sans-serif;font-size:17px;line-height:1.35;opacity:.9">Your bookmarks, as your new tab.</p>
    <img src="${spaceImg}" style="position:absolute;left:150px;top:144px;width:420px;border-radius:10px;box-shadow:0 14px 40px rgb(0 0 0 / .35)">`],
  ["promo-marquee-1400x560", 1400, 560, `
    <div style="position:absolute;left:84px;top:150px;display:flex;align-items:center;gap:20px"><span style="border-radius:18px;box-shadow:0 0 0 3px rgb(255 255 255 / .35)">${mark(76)}</span><b style="font-size:58px;letter-spacing:-.025em">New Tab</b></div>
    <p style="position:absolute;left:84px;top:262px;margin:0;font-family:Inter,sans-serif;font-size:26px;line-height:1.4;opacity:.9;width:520px">Your bookmarks, as your new tab. Tiles you drag, short names you type, the sky where you are.</p>
    <img src="${spaceImg}" style="position:absolute;left:680px;top:96px;width:820px;border-radius:16px;box-shadow:0 30px 80px rgb(0 0 0 / .38), 0 0 0 1px rgb(255 255 255 / .12)">`],
];
for (const [name, w, h, body] of TILES) {
  await frame.setViewportSize({ width: w, height: h });
  await frame.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#0b6e5f;font-family:'Inter Display','Inter',sans-serif;color:#fff;position:relative">${body}</body>`);
  await frame.waitForTimeout(150);
  await frame.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(name);
}
await frame.setViewportSize({ width: 128, height: 128 });
await frame.setContent(`<!doctype html><body style="margin:0;width:128px;height:128px;display:grid;place-items:center;background:transparent">${mark(96)}</body>`);
await frame.screenshot({ path: path.join(out, "store-icon-128.png"), omitBackground: true });
console.log("store-icon-128");

// ---------- the README's demo: a space, a search across everything kept, then Today's sky pointed along
const frames = path.join(raw, "frames");
fs.mkdirSync(frames);
let n = 0;
const grab = async (p, times = 1) => { const f = path.join(frames, `f${String(n).padStart(4, "0")}.png`); await p.screenshot({ path: f }); for (let i = 1; i < times; i++) fs.copyFileSync(f, path.join(frames, `f${String(n + i).padStart(4, "0")}.png`)); n += times; };
page = await view(DAY);
await grab(page, 14);
await page.click("#findBox");
for (const ch of "tax") { await page.keyboard.type(ch); await page.waitForTimeout(120); await grab(page, 2); }
await page.waitForFunction(() => document.querySelectorAll("#findList li").length > 0);
await grab(page, 14);
await page.keyboard.press("Escape"); await page.locator("#findBox").blur();
await page.mouse.move(28, 32); await grab(page, 3);
await page.click("#menuBtn"); await grab(page, 6);
await page.click('#pages .tab:has-text("Today")'); await page.waitForTimeout(900); await grab(page, 6);
const sky = await page.locator(".sky-chart").boundingBox();
for (let i = 0; i <= 30; i++) { await page.mouse.move(sky.x + sky.width * (0.55 + 0.43 * i / 30), sky.y + sky.height * 0.5); await page.waitForTimeout(40); await grab(page); }
await grab(page, 12);
await ctx.close();
const gif = path.join(out, "demo.gif");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "8", "-i", path.join(frames, "f%04d.png"), "-vf", "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", gif]);
console.log("demo.gif", (fs.statSync(gif).size / 1e6).toFixed(1), "MB");
fs.rmSync(raw, { recursive: true });
