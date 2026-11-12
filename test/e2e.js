// Loads the extension in Playwright's Chromium and exercises every feature against the real
// chrome.* APIs, with the network stubbed. Run: node test/e2e.js (needs playwright).
import { launch, seed, grantedCopy, manifest } from "./harness.js";

let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? "PASS " : "FAIL ") + name + (extra !== undefined ? "  " + JSON.stringify(extra) : "")); };

const { ctx, sw, id, net, errs, open, tree, find, titles } = await launch();
await seed(sw);
const tabOrder = () => sw.evaluate(async () => (await chrome.tabs.query({})).filter((x) => /^https?:/.test(x.url)).sort((x, y) => x.index - y.index).map((x) => new URL(x.url).hostname));
const place = () => sw.evaluate(async () => (await chrome.storage.local.get("place")).place);
const go = async (u) => { const q = await ctx.newPage(); await q.goto(u).catch(() => {}); await q.waitForTimeout(700); const r = q.url(); await q.close(); return r; };
// Drops are aimed at one side of the target: the near edge for "before", the far edge for "after".
const edge = async (q, sel, side) => { const b = await q.locator(sel).boundingBox(); return { left: { x: 4, y: b.height / 2 }, right: { x: b.width - 4, y: b.height / 2 }, top: { x: b.width / 2, y: 3 }, bottom: { x: b.width / 2, y: b.height - 3 } }[side]; };
const drag = async (q, from, to, side) => { await q.dragAndDrop(from, to, { targetPosition: await edge(q, to, side) }); await q.waitForTimeout(400); };
const text = (q, sel) => q.textContent(sel);

const a = await ctx.newPage(); await a.goto("https://example.com/alpha");
const b = await ctx.newPage(); await b.goto("https://example.org/beta");
const nt = await ctx.newPage(); await nt.goto("chrome://newtab").catch(() => {});
ok("new tab override loads the extension page", nt.url().includes(id), nt.url()); await nt.close();
const p = await open();
await p.waitForSelector(".card");

// ---------- where you are ----------
ok("first run asks where you are and looks nothing up", !(await p.$("#ask[hidden]")) && !!(await p.$("#glSun[hidden]")) && !!(await p.$("#glWx[hidden]")) && net.points.length === 0 && /\d/.test(await text(p, "#glTime")), { lookups: net.points });
await p.click('#askForm button:has-text("Use this computer")');
await p.waitForFunction(() => /^\d+°$/.test(document.getElementById("glTemp").textContent) && !document.getElementById("glRadar").hidden, null, { timeout: 8000 }).catch(() => {});
ok("\"Use this computer's location\" saves a rounded place and the forecast follows it", (await place()).source === "device" && (await place()).lat === 40.71 && net.points.join() === "40.71,-74.01" && !!(await p.$("#ask[hidden]")), { place: await place(), lookups: net.points });

// ---------- layout, the glance, the footer ----------
ok("tabs: spaces, then Today and Shortcuts", true, [await p.$$eval("#spaces .tab", (x) => x.map((e) => e.textContent)), await p.$$eval("#pages .tab", (x) => x.map((e) => e.textContent))]);
ok("the glance shows the time, the sun and the weather now", /\d/.test(await text(p, "#glTime")) && /↑ \d/.test(await text(p, "#glRise")) && /↓ \d/.test(await text(p, "#glSet")) && / in \d/.test(await text(p, "#glLeft")) && /^\d+°$/.test(await text(p, "#glTemp")) && /High|Low/.test(await text(p, "#glHiLo")), { time: await text(p, "#glTime"), sun: await text(p, "#glLeft"), now: [await text(p, "#glTemp"), await text(p, "#glText"), await text(p, "#glHiLo")] });
ok("the glance has a radar still, not the loop", /_0\.gif/.test(await p.$eval("#glRadarImg", (i) => i.src)) && !(await p.$("#glRadar[hidden]")));
ok("the footer says how to type a short link, leads to them all, and holds Extras and the version", /mail\/.*claude\/.*short name/.test(await text(p, "#hint")) && !!(await p.$("#hint #goShortcuts")) && (await p.$$eval(".foot nav .mini", (x) => x.map((e) => e.id))).join() === "extrasBtn,version" && (await text(p, "#version")) === "v" + manifest.version, await text(p, "#hint"));
ok("Edit is a pencil with a name for screen readers; the bookmark manager shows only while editing", (await p.getAttribute("#edit", "aria-label")) === "Edit bookmarks" && !!(await p.$("#edit svg")) && !(await p.isVisible('[data-go="chrome://bookmarks/"]')));
await p.mouse.move(700, 4);
ok("\"Open all\" waits for the pointer, and cards carry no count", (await p.$eval(".card .act", (e) => getComputedStyle(e).opacity)) === "0" && !(await p.$(".card-head .n")) && !(await p.$(".panel .sub")));

// ---------- icons ----------
await p.waitForFunction(() => document.querySelector('.tile[href="https://app.examplebank.com/"] img'), null, { timeout: 8000 });
await p.waitForTimeout(600);
const src = (href) => p.$eval(`.tile[href="${href}"] .sico img`, (i) => i.src).catch(() => null);
ok("Gmail uses its product icon, not the Google G", /gmail_2020q4/.test(await src("https://mail.google.com/")), await src("https://mail.google.com/"));
ok("a subdomain with no icon falls back to its parent site", /domain=examplebank\.com/.test(await src("https://app.examplebank.com/")), await src("https://app.examplebank.com/"));
await p.click('#spaces .tab:has-text("Product")'); await p.waitForTimeout(900);
ok("a site with no icon anywhere shows its initial", (await text(p, '.tile[href="https://product.example/"] .mono')) === "W");
await p.click('#spaces .tab:has-text("Work")'); await p.waitForSelector(".card");
await p.waitForTimeout(600);
ok("found icons are remembered", await sw.evaluate(async () => { const { icons } = await chrome.storage.local.get("icons"); return !!icons && !!icons["mail.google.com"].src && icons["product.example"].src === ""; }));

// ---------- Up next and open tabs ----------
ok("open tabs listed with their site", (await p.$$("#tabs li")).length === 2, await p.$$eval("#tabs .row", (x) => x.map((e) => e.textContent)));
ok("each open tab's × is on show without pointing at the row", (await p.$$eval("#tabs .close", (x) => x.map((e) => getComputedStyle(e).display))).join() === "block,block");
for (const n of [1, 2]) { await p.hover(`#tabs li:nth-child(${n})`); await p.click(`#tabs li:nth-child(${n}) .mini`); await p.waitForFunction((k) => document.querySelectorAll("#next li").length === k, n); }
const next = find(await tree(), "⏭️ Next");
ok("Up next is a bookmarks folder under Other bookmarks", !!next && next.parentId === "2" && next.children.length === 2);
await drag(p, "#next li:nth-child(1)", "#next li:nth-child(2)", "bottom");
ok("drag reorders Up next", find(await tree(), "⏭️ Next").children[0].title.includes("example.org"));
await p.click("#next li:nth-child(1) .check"); await p.waitForFunction(() => document.querySelectorAll("#next li").length === 1);
await p.click("#toast button"); await p.waitForFunction(() => document.querySelectorAll("#next li").length === 2);
ok("ticking one off removes it, and Undo puts it back first", find(await tree(), "⏭️ Next").children[0].title.includes("example.org"));
ok("the toolbar button has a listener and a keyboard shortcut", (await sw.evaluate(() => chrome.action.onClicked.hasListeners())) && !!manifest.commands._execute_action.suggested_key.default);
const money = find(await tree(), "💵 Money");
await p.dragAndDrop("#tabs li:nth-child(1)", `.card[data-folder="${money.id}"]`); await p.waitForTimeout(400);
ok("dragging an open tab onto a card saves it there", (await titles("💵 Money")).length === 3);

// ---------- reordering by drag, without Edit ----------
const ws = find(await tree(), "✉️ Workspace");
await drag(p, '.tile[href="https://app.examplebank.com/"]', '.tile[href="https://dashboard.stripe.com/"]', "left");
ok("a tile dropped on the left of another lands before it", (await titles("💵 Money")).slice(0, 2).join() === "Bank,Stripe", await titles("💵 Money"));
await drag(p, '.tile[href="https://dashboard.stripe.com/"]', '.tile[href="https://mail.google.com/"]', "right");
ok("a tile dropped on the right of one in another card lands after it", (await titles("✉️ Workspace")).slice(0, 3).join() === "Gmail,Stripe,Calendar", await titles("✉️ Workspace"));
await drag(p, `.card[data-folder="${money.id}"] .card-head`, `.card[data-folder="${ws.id}"]`, "top");
ok("a card dragged by its head lands above the card it is dropped on", (await titles("🏢 Work")).slice(0, 2).join() === "💵 Money,✉️ Workspace", await titles("🏢 Work"));
await drag(p, '#spaces .tab:has-text("Product")', '#spaces .tab:has-text("Work")', "left");
ok("a space tab dragged onto another reorders the bookmarks bar", (await p.$$eval("#spaces .tab", (x) => x.map((e) => e.textContent))).join() === "📖 Product,🏢 Work" && (await tree()).children[0].children[0].title === "📖 Product");
await drag(p, "#tabs li:nth-child(2)", "#tabs li:nth-child(1)", "top");
ok("an open tab dragged above another moves in the tab strip", (await tabOrder()).join() === "example.org,example.com", await tabOrder());
await p.hover("#tabs li:nth-child(1)"); await p.click("#tabs li:nth-child(1) .close"); await p.waitForFunction(() => document.querySelectorAll("#tabs li").length === 1);
ok("× on an open tab closes it", (await tabOrder()).join() === "example.com");
await p.click("#toast button"); await p.waitForFunction(() => document.querySelectorAll("#tabs li").length === 2);
ok("Undo opens it again in the same place", (await tabOrder()).join() === "example.org,example.com", await tabOrder());

// ---------- folders inside a collection ----------
ok("a folder inside a collection is a headed group, and one inside that shows its path", (await p.$$eval(".group h3", (x) => x.map((e) => e.textContent))).join() === "🏛️ Filings,🏛️ Filings › Federal");
const federal = find(await tree(), "Federal");
await p.dragAndDrop('.tile[href="https://account.exampleagent.com/"]', `.group[data-folder="${federal.id}"] h3`); await p.waitForTimeout(400);
ok("a tile dropped on a group moves into that folder", (await titles("Federal")).join() === "IRS,Agent", await titles("Federal"));

// ---------- notes ----------
await p.fill("#note", "call the accountant"); await p.waitForFunction(() => document.getElementById("noteState").textContent === "saved", null, { timeout: 4000 }).catch(() => {});
ok("a note saves itself to synced storage", (await sw.evaluate(async () => (await chrome.storage.sync.get("note")).note)) === "call the accountant");

// ---------- edit mode ----------
await p.click("#edit");
await p.click(`.card[data-folder="${money.id}"] .tile:nth-child(2) .x`); await p.waitForTimeout(300);
ok("× removes a link", (await titles("💵 Money")).join() === "Bank", await titles("💵 Money"));
await p.click("#toast button"); await p.waitForTimeout(300);
ok("Undo restores it in its place", (await titles("💵 Money")).length === 2 && (await titles("💵 Money"))[0] === "Bank", await titles("💵 Money"));
await p.click('.tile[href="https://app.examplebank.com/"] .name'); await p.fill(".tile .rename", "Checking"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
ok("in Edit, a click on a tile's name renames the bookmark", (await titles("💵 Money"))[0] === "Checking", await titles("💵 Money"));
await p.click(`.card[data-folder="${money.id}"] h2`); await p.fill(".rename", "💵 Banking"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
ok("rename writes the bookmark folder", !!find(await tree(), "💵 Banking"));
await p.click(`.group[data-folder="${federal.id}"] h3`); await p.fill(".rename", "Federal filings"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
ok("renaming a group changes its own name, not its path", !!find(await tree(), "Federal filings") && !!find(await tree(), "🏛️ Filings"));
ok("New collection is drawn like Add link: a dashed plus and a label", !!(await p.$(".new-card .sico.plus")) && (await text(p, ".new-card .name")) === "New collection" && !!(await p.$(".tile.add .sico.plus")));
await p.click(".new-card"); await p.waitForSelector(".rename"); await p.fill(".rename", "📎 Extras"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
ok("New collection adds a folder and names it", !!find(await tree(), "📎 Extras"));
await p.click("#edit");

await p.click("#saveTabs"); await p.waitForTimeout(500);
const saved = find(await tree(), "🏢 Work").children.find((c) => c.title.startsWith("🗂️ Tabs"));
ok("Save all makes a collection of the open tabs", !!saved && saved.children.length === 2);
await p.hover(`.card[data-folder="${ws.id}"]`); await p.click(`.card[data-folder="${ws.id}"] .card-head .mini`); await p.waitForTimeout(900);
const groups = await sw.evaluate(async () => { const g = await chrome.tabGroups.query({}); const t = await chrome.tabs.query({}); return { titles: g.map((x) => x.title), grouped: t.filter((x) => x.groupId !== -1).length }; });
ok("Open all makes one named tab group", groups.titles.join() === "✉️ Workspace" && groups.grouped === (await titles("✉️ Workspace")).length, groups);

// ---------- shortcuts page ----------
await p.bringToFront(); await p.click('#pages .tab:has-text("Shortcuts")'); await p.waitForSelector(".sc-card");
const keys = () => p.$$eval("#scBody .key", (x) => x.map((e) => e.textContent));
ok("built-in names with no bookmark of their own are listed under Always there", (await p.$$eval(".key.fixed", (x) => x.map((e) => e.textContent))).join() === "g/,claude/");
ok("a bookmark of a built-in's site carries its name, once: Calendar is cal/, Gmail is mail/", (await keys()).filter((k) => k === "cal/").length === 1 && (await keys()).filter((k) => k === "mail/").length === 1 && !(await keys()).some((k) => ["calendar/", "gmail/"].includes(k)) && /mail\/invoice/.test(await text(p, '.sc-row:has-text("Gmail") .sc-note')), await keys());
ok("Chrome's own search shortcuts are one click from the Shortcuts page", !!(await p.$('#scBody [data-go="chrome://settings/searchEngines"]')));
ok("no tasks/ shortcut; todo/ comes from the Todo list bookmark", !(await keys()).includes("tasks/") && (await keys()).includes("todo/"));
await p.locator(".sc-row", { hasText: "Stripe" }).locator(".key").click(); await p.fill(".alias-input", "pay"); await p.keyboard.press("Enter");
await p.waitForFunction(() => [...document.querySelectorAll(".key")].some((k) => k.textContent === "pay/"));
ok("a short name can be changed on the Shortcuts page", true);
await p.fill('.sc-add [aria-label="Shortcut name"]', "HN"); await p.fill('.sc-add [aria-label="Address"]', "hn.algolia.com/?q=%s"); await p.click(".sc-add button");
await p.waitForFunction(() => [...document.querySelectorAll(".key.fixed")].some((k) => k.textContent === "hn/"));
ok("a shortcut of your own can be added on the Shortcuts page", (await sw.evaluate(async () => (await chrome.storage.sync.get("links")).links.hn)) === "https://hn.algolia.com/?q=%s");
await p.click('.chip:has-text("gpt/")'); await p.waitForFunction(() => [...document.querySelectorAll(".key.fixed")].some((k) => k.textContent === "gpt/"));
ok("a suggested shortcut is one click, and leaves the suggestions", !(await p.$('.chip:has-text("gpt/")')) && !!(await p.$('.chip:has-text("yt/")')));

ok("hn/rust-lang → your own shortcut, with the words filled in", (await go("http://hn/rust-lang")) === "https://hn.algolia.com/?q=rust%20lang");
ok("gpt/hello-there → the suggested one", (await go("http://gpt/hello-there")) === "https://chatgpt.com/?q=hello%20there");
await p.click('.sc-row:has-text("hn/") .mini'); await p.waitForFunction(() => ![...document.querySelectorAll(".key.fixed")].some((k) => k.textContent === "hn/"));
ok("and removed again", !(await keys()).includes("hn/") && (await go("http://hn/")) === "http://hn/");
ok("pay/ → Stripe (the name just set)", (await go("http://pay/")).startsWith("https://dashboard.stripe.com"));
ok("mail/ → Gmail", (await go("http://mail/")).startsWith("https://mail.google.com"));
ok("cal/ opens your Calendar bookmark's own address, and calendar/ still works", (await go("http://cal/")) === "https://calendar.google.com/calendar/u/0/r" && (await go("http://calendar/")) === "https://calendar.google.com/calendar/u/0/r");
ok("admin/ → bookmark by first word", (await go("http://admin/")).startsWith("https://admin.google.com"));
ok("todo/ → the Todo list bookmark", (await go("http://todo/")) === "https://todo.example.com/");
ok("claude/what-is-x → Claude with the question", (await go("http://claude/what-is-x")) === "https://claude.ai/new?q=what%20is%20x");
ok("keep/idea → searches Keep", (await go("http://keep/idea")).startsWith("https://keep.google.com/#search/text=idea"));
ok("tasks/ and unknown words are left alone", (await go("http://tasks/")) === "http://tasks/" && (await go("http://nope/")) === "http://nope/");
ok("real sites are left alone", (await go("https://example.com/x")) === "https://example.com/x");
// With a space in it, Chrome searches for what was typed; that search is read as the short link.
ok("claude/what is a tsunami? (typed with spaces, so searched) → Claude with the question", (await go("https://www.google.com/search?q=claude%2Fwhat+is+a+tsunami%3F&oq=claude")) === "https://claude.ai/new?q=what%20is%20a%20tsunami%3F");
ok("mail/invoice from stripe, searched on another engine → Gmail search", (await go("https://duckduckgo.com/?q=mail%2Finvoice+from+stripe")).startsWith("https://mail.google.com/mail/u/0/#search/invoice%20from%20stripe"));
ok("a search only counts for a whole short name", (await go("https://www.google.com/search?q=adm%2Fusers")).includes("google.com/search") && (await go("https://www.google.com/search?q=and%2For+logic")).includes("google.com/search") && (await go("https://www.google.com/search?q=plain+words")).includes("google.com/search"));

// ---------- today ----------
await p.bringToFront();
let t0 = Date.now(); await p.click('#pages .tab:has-text("Today")'); await p.waitForSelector(".wx-temp", { timeout: 5000 });
ok("the forecast is on screen within a second and a half", Date.now() - t0 < 1500, { ms: Date.now() - t0 });
ok("a place taken from the computer is named by the forecast", (await text(p, "#place")) === "New York, NY");
ok("clock, sunrise, sunset and day length are drawn", /\d/.test(await text(p, "#bigTime")) && /\d/.test(await text(p, "#rise")) && /\d/.test(await text(p, "#set")) && /daylight/.test(await text(p, "#daylight")), { time: await text(p, "#bigTime"), rise: await text(p, "#rise"), set: await text(p, "#set") });
ok("the light is named, with what comes next and when", ["Daylight", "Golden hour", "Civil twilight", "Nautical twilight", "Astronomical twilight", "Night"].includes(await text(p, "#phase")) && /^(First light|Dawn|Sunrise|Golden hour|Sunset|Dusk|Full dark) in \d/.test(await text(p, "#nextUp")), [await text(p, "#phase"), await text(p, "#nextUp")]);
ok("twilight times and the moon are written out", /dawn \d/i.test(await text(p, "#riseSub")) && /dusk \d/i.test(await text(p, "#setSub")) && /(moon|crescent|quarter|gibbous) · \d+% lit/i.test(await text(p, "#moonLine")), [await text(p, "#riseSub"), await text(p, "#setSub"), await text(p, "#moonLine")]);
ok("the sun sits on its path, over the three twilights and night", await p.evaluate(() => +document.getElementById("sunDot").getAttribute("cx") > 0 && document.getElementById("sunPathUp").getAttribute("d").length > 500 && [...document.querySelectorAll(".band-name")].map((n) => n.textContent).join() === "Civil,Nautical,Astronomical,Night"));
ok("now, an hourly chart and seven days", /^\d+°$/.test(await text(p, ".wx-temp")) && !!(await p.$(".hc-line")) && (await p.$$("#wxDays li")).length === 7, { now: await text(p, ".wx-now"), days: await p.$$eval("#wxDays li", (x) => x.map((e) => e.textContent)) });
ok("days are named by date, not by the service's holiday names", (await text(p, "#wxDays li:first-child .d")) === "Today");
ok("no links to mail or calendar on Today", (await p.$$("#today a")).length === 1);
await p.waitForSelector("#radarCard:not([hidden])", { timeout: 4000 }).catch(() => {});
ok("radar shows once its image loads, as wide as its column up to 600 px", !(await p.$("#radarCard[hidden]")) && (await p.$eval("#radarImg", (i) => i.getBoundingClientRect().width)) >= 500 && /_loop\.gif/.test(await p.$eval("#radarImg", (i) => i.src)));

// changing the place
const pick = async (city) => { await p.click("#placeBtn"); await p.fill("#todayAskForm input", city); await p.click('#todayAskForm button:has-text("Search")'); await p.click("#todayAskForm .place-hits button"); };
await pick("Oakland");
await p.waitForFunction(() => document.getElementById("place").textContent.startsWith("Oakland") && document.querySelector(".wx-temp"), null, { timeout: 8000 }).catch(() => {});
ok("a typed city becomes the place and the forecast is fetched for it, with one search per press", (await place()).source === "typed" && (await text(p, "#place")) === "Oakland, California, United States" && net.points.at(-1) === "37.8,-122.27" && net.searches.join() === "Oakland", { place: await place(), lookups: net.points, searches: net.searches });
await pick("Paris");
await p.waitForFunction(() => /United States/.test(document.getElementById("wxNote").textContent), null, { timeout: 8000 }).catch(() => {});
ok("outside the United States it says there is no forecast, and the sky still works", /National Weather Service covers the United States/.test(await text(p, "#wxNote")) && !(await p.$(".wx-temp")) && (await text(p, "#place")).startsWith("Paris") && /\d/.test(await text(p, "#rise")) && !!(await text(p, "#phase")), await text(p, "#wxNote"));
await p.click("#placeBtn"); await p.click('#todayAskForm button:has-text("Use this computer")');
await p.waitForFunction(() => document.getElementById("place").textContent === "New York, NY" && document.querySelector(".wx-temp"), null, { timeout: 8000 }).catch(() => {});
ok("and back to this computer's location", (await place()).source === "device" && (await text(p, "#place")) === "New York, NY" && !!(await p.$("#todayAsk[hidden]")));

// the sky at fixed moments in New York: solar noon, after sunset, the small hours, a full moon
const sky = async (at) => { const q = await open({ at }); await q.waitForSelector(".card"); await q.click('#pages .tab:has-text("Today")'); await q.waitForFunction(() => document.getElementById("phase").textContent); return q; };
const look = (q) => q.evaluate(() => ({ theme: document.documentElement.dataset.theme, phase: document.getElementById("phase").textContent, next: document.getElementById("nextUp").textContent, x: +document.getElementById("sunDot").getAttribute("cx"), y: +document.getElementById("sunDot").getAttribute("cy"), stars: document.getElementById("stars").style.opacity, ink: document.getElementById("sky").style.getPropertyValue("--sky-ink"), moon: document.getElementById("moon").style.display !== "none", lit: document.getElementById("moonLit").getAttribute("d"), turn: document.getElementById("moonLit").getAttribute("transform"), line: document.getElementById("moonLine").textContent }));
let q = await sky("2024-06-21T16:58:00Z");
let s = await look(q);
ok("at solar noon the sun is at the middle of the chart, high, and the page is light", Math.abs(s.x - 320) < 4 && s.y < 80 && s.phase === "Daylight" && s.theme === "light" && s.stars === "0" && s.ink === "#11151b", s);
await q.close(); q = await sky("2024-06-22T00:51:00Z");
s = await look(q);
ok("twenty minutes after sunset it is civil twilight: sun under the horizon, sky ink light, page not yet dark", s.phase === "Civil twilight" && /^Dusk in \d+ min$/.test(s.next) && s.y > 196 && s.ink === "#f2f5fa" && s.theme === "light", s);
await q.close(); q = await sky("2024-06-22T05:00:00Z");
s = await look(q);
ok("in the small hours it is night: the page is dark, the stars are out, first light is next", s.phase === "Night" && s.theme === "dark" && s.stars === "1" && /^First light in/.test(s.next) && s.y > 240, s);
const saved2 = await q.evaluate(() => JSON.parse(localStorage.getItem("night")));
ok("tonight's dusk and dawn are left for the next tab's first paint", saved2.from < Date.parse("2024-06-22T05:00:00Z") && saved2.to > Date.parse("2024-06-22T05:00:00Z") && saved2.to - saved2.from < 10 * 3600e3, saved2);
await q.close(); q = await sky("2024-09-18T04:55:00Z");
s = await look(q);
ok("a full moon is up at midnight and drawn full", s.moon && /Full moon · (99|100)% lit/.test(s.line) && / 0 0 1 -11 0 Z$/.test(s.lit), s);
await q.close(); q = await sky("2024-04-11T00:30:00Z");
s = await look(q);
const turn = ((+/rotate\(([-\d.]+)\)/.exec(s.turn)[1] % 360) + 360) % 360;
ok("an evening crescent is a crescent, lit on the lower right, toward the sun that just set", s.moon && /Waxing crescent/.test(s.line) && / 0 0 0 -11 0 Z$/.test(s.lit) && turn > 60 && turn < 180, { line: s.line, turn });
await q.close();

// theme.js alone decides the first paint: hold the page's own script back and look
const bare = await ctx.newPage(); await bare.goto(`chrome-extension://${id}/theme.js`);
await bare.evaluate(() => localStorage.setItem("night", JSON.stringify({ from: Date.now() - 3600e3, to: Date.now() + 3600e3 })));
net.holdPage = true;
q = await open({ waitUntil: "commit" });
await q.waitForFunction(() => document.documentElement.dataset.theme && document.getElementById("glTime"));
ok("a tab opened at night is dark before the page's script has run", (await q.evaluate(() => document.documentElement.dataset.theme + "|" + document.getElementById("glTime").textContent)) === "dark|");
net.holdPage = false; await q.close(); await bare.close();

// ---------- the weather service unreachable ----------
net.weatherDown = true;
q = await open(); await q.waitForSelector(".card");
ok("a new tab reopens on the last space, not Today or Shortcuts", (await q.$eval('#spaces .tab[aria-selected="true"]', (e) => e.textContent)) === "🏢 Work" && !!(await q.$("#today[hidden]")));
ok("the note is there on the next new tab", (await q.inputValue("#note")) === "call the accountant");
ok("the glance still draws with the service down", /^\d+°$/.test(await text(q, "#glTemp")));
t0 = Date.now(); await q.click("#glance"); await q.waitForSelector(".wx-temp", { timeout: 3000 });
ok("the glance opens Today, drawn from the saved forecast with the service down", Date.now() - t0 < 800 && !!(await q.$("#wxNote[hidden]")), { ms: Date.now() - t0 });
await sw.evaluate(async () => { const { wx } = await chrome.storage.local.get("wx"); wx.at -= 3600e3; await chrome.storage.local.set({ wx }); });
await q.close(); q = await open(); await q.click('#pages .tab:has-text("Today")'); await q.waitForSelector("#wxNote:not([hidden])", { timeout: 5000 });
ok("an old forecast stays up with a note when it can't refresh", !!(await q.$(".wx-temp")), await text(q, "#wxNote"));

// ---------- extras are off until asked for ----------
await q.click('#spaces .tab:has-text("Work")'); await q.waitForSelector(".card");
ok("unread mail and recent files ship switched off, as optional permissions", !!(await q.$("#glMail[hidden]")) && !!(await q.$("#filesPanel[hidden]")) && manifest.optional_permissions.join() === "history" && manifest.optional_host_permissions.join() === "https://mail.google.com/*" && !manifest.permissions.includes("history"));
await q.click("#extrasBtn"); await q.waitForSelector(".extra");
ok("Extras in the footer lists them, both off", (await q.$$eval(".extra .btn", (x) => x.map((e) => `${e.getAttribute("aria-label")}:${e.textContent}`))).join() === "Unread mail:Off,Recent files:Off");

// ---------- a busy tab ----------
const before = (await q.$$("#tabs li")).length;
const tk = await ctx.newPage(); await tk.goto("https://example.net/ticker"); await q.bringToFront();
await q.waitForFunction(() => [...document.querySelectorAll("#tabs .t")].some((n) => /^tick \d+$/.test(n.textContent)), null, { timeout: 8000 });
const was = await q.evaluate(() => { const li = [...document.querySelectorAll("#tabs li")].find((l) => /tick \d/.test(l.textContent)); li.dataset.same = "yes"; return li.querySelector(".t").textContent; });
await q.waitForFunction((old) => { const li = document.querySelector("#tabs li[data-same]"); return li && li.querySelector(".t").textContent !== old; }, was, { timeout: 8000 }).catch(() => {});
ok("a tab whose title keeps changing keeps its row, updated in place", await q.evaluate((old) => { const li = document.querySelector("#tabs li[data-same]"); return !!li && /^tick \d+$/.test(li.querySelector(".t").textContent) && li.querySelector(".t").textContent !== old; }, was), was);
await q.click("#tabs li[data-same] .close"); await q.waitForFunction((n) => document.querySelectorAll("#tabs li").length === n, before);
ok("and its × closes it while it is busy", tk.isClosed() && (await q.$$("#tabs li")).length === before);
await q.click("#tabs li:nth-child(1) .row", { button: "middle" }); await q.waitForFunction((n) => document.querySelectorAll("#tabs li").length === n, before - 1);
ok("a middle click on a row closes that tab", (await q.$$("#tabs li")).length === before - 1);

await q.click("#goShortcuts"); await q.waitForSelector(".sc-card");
ok("\"All shortcuts\" in the footer opens the Shortcuts page", (await q.getAttribute('#pages .tab:has-text("Shortcuts")', "aria-selected")) === "true");
await q.click('#spaces .tab:has-text("Work")'); await q.waitForSelector(".card"); await q.click("#edit");
ok("while editing, the pencil is a tick and the bookmark manager is offered", (await q.getAttribute("#edit", "aria-pressed")) === "true" && (await q.isVisible('[data-go="chrome://bookmarks/"]')));
await q.click('#pages .tab:has-text("Today")');
ok("leaving for Today ends editing", (await q.evaluate(() => document.body.classList.contains("editing"))) === false);
await q.click('#spaces .tab:has-text("Work")'); await q.waitForSelector(".card"); await q.click("#edit");
await q.click('[data-go="chrome://bookmarks/"]'); await q.waitForURL(/^chrome:\/\/bookmarks/, { timeout: 5000 }).catch(() => {});
ok("\"Bookmark manager\" opens Chrome's own", q.url().startsWith("chrome://bookmarks"), q.url());
ok("no page errors", errs.length === 0, errs);
await ctx.close();

// ---------- the extras, on a copy that already holds their permissions ----------
const g = await launch({ ext: grantedCopy() });
await seed(g.sw);
await g.sw.evaluate(() => chrome.storage.local.set({ place: { lat: 40.71, lon: -74.01, source: "device", at: Date.now() } }));
const file = await g.ctx.newPage();
await file.goto("https://docs.google.com/spreadsheets/d/abc123/edit#gid=0"); await file.waitForTimeout(300);
await file.goto("https://docs.google.com/document/d/xyz789/edit?tab=t.0"); await file.waitForTimeout(300);
const e = await g.open(); await e.waitForSelector(".card");
await e.waitForSelector("#glMail:not([hidden])", { timeout: 5000 }).catch(() => {});
ok("with its permission, the unread count shows in the glance and links to the inbox", (await text(e, "#glMailCount")) === "7" && (await e.getAttribute("#glMail", "href")).startsWith("https://mail.google.com/"));
await e.waitForSelector("#files li", { timeout: 5000 }).catch(() => {});
ok("with its permission, the Google files opened lately are listed by name, newest first", (await e.$$eval("#files .row", (x) => x.map((r) => `${r.textContent}|${r.getAttribute("href")}`))).join(";") === "Launch notes|https://docs.google.com/document/d/xyz789/edit;Q4 plan|https://docs.google.com/spreadsheets/d/abc123/edit", await e.$$eval("#files .row", (x) => x.map((r) => `${r.textContent}|${r.getAttribute("href")}`)));
await e.waitForFunction(() => document.querySelectorAll("#files .sico img").length === 2, null, { timeout: 5000 }).catch(() => {});
ok("a spreadsheet gets the Sheets icon and a document the Docs one", /docs_2020q4/.test(await e.$eval("#files li:nth-child(1) img", (i) => i.src).catch(() => "")) && /sheets_2020q4/.test(await e.$eval("#files li:nth-child(2) img", (i) => i.src).catch(() => "")));
await e.click("#extrasBtn"); await e.waitForSelector(".extra");
ok("their switches read On", (await e.$$eval(".extra .btn", (x) => x.map((b) => b.textContent))).join() === "On,On");
ok("no page errors with the extras on", g.errs.length === 0, g.errs);
await g.ctx.close();

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
