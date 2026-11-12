// Screenshots of every view at 1280×800, the size the Chrome Web Store asks for, with sample
// bookmarks, a stubbed forecast and a stand-in radar frame. Run: node test/shots.js [folder]
process.env.TZ = "America/New_York";
const { launch, seed, root } = await import("./harness.js");
const fs = await import("node:fs");
const path = await import("node:path");

const out = process.argv[2] || path.join(root, "store", "screenshots");
fs.mkdirSync(out, { recursive: true });
const { ctx, sw, net, open } = await launch({ icons: "letters", viewport: { width: 1280, height: 800 }, timezoneId: "America/New_York" });
await seed(sw);
Object.assign(net.titles, { "example.com/roadmap": "Roadmap: winter", "example.org/invoice": "Invoice 1042", "example.net/paper": "Paper weights compared" });
for (const u of ["https://example.com/roadmap", "https://example.org/invoice"]) await (await ctx.newPage()).goto(u);
await sw.evaluate(async () => {
  const next = await chrome.bookmarks.create({ parentId: "2", title: "⏭️ Next" });
  await chrome.bookmarks.create({ parentId: next.id, title: "Paper weights compared", url: "https://example.net/paper" });
  await chrome.bookmarks.create({ parentId: next.id, title: "Quarterly estimate", url: "https://tax.example.gov/estimate" });
  await chrome.storage.sync.set({ note: "Ask the printer about paper weight\nRenew the domain by Friday" });
});
const shot = async (page, name) => { await page.mouse.move(640, 790); await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log(name); };
const view = async (at, tab) => {
  net.at = Date.parse(at);
  // Each pinned moment gets its own forecast: drop the saved one so the page fetches it.
  await sw.evaluate(() => chrome.storage.local.remove("wx"));
  const page = await open({ at });
  await page.waitForSelector(".card");
  if (await sw.evaluate(async () => !!(await chrome.storage.local.get("place")).place)) await page.waitForFunction(() => /°/.test(document.getElementById("glTemp").textContent) && !document.getElementById("glRadar").hidden, null, { timeout: 8000 });
  if (tab) { await page.click(`#pages .tab:has-text("${tab}")`); await page.waitForTimeout(tab === "Today" ? 900 : 300); }
  return page;
};

const DAY = "2024-06-21T19:30:00Z", GOLDEN = "2024-06-22T00:12:00Z", DUSK = "2024-06-22T00:51:00Z", NIGHT = "2024-06-22T05:00:00Z", CRESCENT = "2024-04-11T00:20:00Z";
let page = await view(DAY);
await shot(page, "1-first-run");
await page.close();
await sw.evaluate(() => chrome.storage.local.set({ place: { lat: 40.71, lon: -74.01, source: "device", at: Date.now() } }));
page = await view(DAY); await shot(page, "2-space");
await page.click("#edit"); await shot(page, "3-edit"); await page.close();
page = await view(DAY, "Today"); await shot(page, "4-today-day"); await page.close();
page = await view(GOLDEN, "Today"); await shot(page, "5-today-golden-hour"); await page.close();
page = await view(DUSK, "Today"); await shot(page, "6-today-dusk"); await page.close();
page = await view(NIGHT, "Today"); await shot(page, "7-today-night"); await page.close();
page = await view(NIGHT); await shot(page, "8-space-night"); await page.close();
page = await view(CRESCENT, "Today"); await shot(page, "9-today-crescent"); await page.close();
page = await view(DAY, "Shortcuts"); await shot(page, "10-shortcuts"); await page.close();

// The store's small promo tile, 440×280.
page = await ctx.newPage();
await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<body style="margin:0;width:440px;height:280px;display:grid;place-content:center;gap:14px;background:linear-gradient(#bcd4f2 0%,#ffe2b8 62%,#0b6e5f 62%);font-family:ui-rounded,-apple-system,'Segoe UI',system-ui,sans-serif;color:#11151b">
  <svg viewBox="0 0 300 96" width="300" height="96" style="justify-self:center"><path d="M10 92 A140 86 0 0 1 290 92" fill="none" stroke="#11151b" stroke-opacity=".25" stroke-width="3"/><path d="M10 92 A140 86 0 0 1 206 23" fill="none" stroke="#f59e0b" stroke-width="5" stroke-linecap="round"/><circle cx="206" cy="23" r="13" fill="#f59e0b"/></svg>
  <div style="text-align:center;color:#fff;margin-top:26px"><div style="font-weight:700;font-size:28px;letter-spacing:-.02em">${(await sw.evaluate(() => chrome.runtime.getManifest().name))}</div><div style="font-size:15px;opacity:.9;margin-top:4px">Your bookmarks, as your new tab</div></div></body>`);
await page.screenshot({ path: path.join(out, "..", "promo-440x280.png") });
console.log("promo");
await ctx.close();
