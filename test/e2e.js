// Loads the extension in Playwright's Chromium and exercises every feature against the real
// chrome.* APIs, with the network stubbed. Run: node test/e2e.js (needs playwright).
import fs from "node:fs";
import { launch, seed, grantedCopy, manifest } from "./harness.js";

let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? "PASS " : "FAIL ") + name + (extra !== undefined ? "  " + JSON.stringify(extra) : "")); };

// The clock is New York's, where the computer is set to be, so the sky and the Tools checks
// have one answer wherever the tests run.
const { ctx, sw, id, net, errs, open, tree, find, titles } = await launch({ timezoneId: "America/New_York" });
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
ok("new tab override loads the extension page", nt.url().includes(id), nt.url());
await nt.close();
const p = await open();
await p.waitForSelector(".card");

// ---------- where you are ----------
await p.waitForFunction(() => /^\d+°$/.test(document.getElementById("glTemp").textContent) && !document.getElementById("glRadar").hidden, null, { timeout: 8000 }).catch(() => {});
ok("the first new tab asks the computer where it is, saves that rounded, and the forecast follows", (await place()).source === "device" && (await place()).lat === 40.71 && net.points.join() === "40.71,-74.01" && !!(await p.$("#ask[hidden]")), { place: await place(), lookups: net.points });

// ---------- layout, the glance, the footer ----------
ok("a new tab opens on your links, with no guide in the way; tabs: spaces, then Today, Shortcuts and Tools", !(await p.$("#space[hidden]")) && (await p.$$eval("#pages .tab", (x) => x.map((e) => e.textContent))).join() === "☀️ Today,⌨️ Shortcuts,🛠️ Tools", [await p.$$eval("#spaces .tab", (x) => x.map((e) => e.textContent)), await p.$$eval("#pages .tab", (x) => x.map((e) => e.textContent))]);
ok("the glance shows the time, the sun and the weather now", /\d/.test(await text(p, "#glTime")) && /↑ \d/.test(await text(p, "#glRise")) && /↓ \d/.test(await text(p, "#glSet")) && / in \d/.test(await text(p, "#glLeft")) && /^\d+°$/.test(await text(p, "#glTemp")) && /^\d+° high, \d+° low/.test(await text(p, "#glHiLo")), { time: await text(p, "#glTime"), sun: await text(p, "#glLeft"), now: [await text(p, "#glTemp"), await text(p, "#glText"), await text(p, "#glHiLo")] });
ok("the time and date are a link to your calendar: your own Calendar bookmark", (await p.getAttribute("#glCal", "href")) === "https://calendar.google.com/calendar/u/0/r" && (await p.evaluate(() => document.getElementById("glCal").contains(document.getElementById("glTime")) && !document.getElementById("glance").contains(document.getElementById("glTime")))));
ok("the glance has a radar still, not the loop", /_0\.gif/.test(await p.$eval("#glRadarImg", (i) => i.src)) && !(await p.$("#glRadar[hidden]")));
ok("the footer says how to type a short link and how to search with one, leads to them all, and carries the version; Settings is a button at the top right", /mail\/.*claude\/.*short name.*mail\/invoice/.test(await text(p, "#hint")) && !!(await p.$("#hint #goShortcuts")) && (await p.getAttribute(".right #extrasBtn", "aria-label")) === "Settings" && !(await p.$(".foot button:not(#goShortcuts)")) && (await text(p, "#version")) === "v" + manifest.version, await text(p, "#hint"));
await p.click("#extrasBtn");
await p.selectOption("#themePick", "dark");
const forcedDark = await p.evaluate(() => document.documentElement.dataset.theme);
const repaint = await open(); const early = await repaint.evaluate(() => document.documentElement.dataset.theme); await repaint.close(); await p.bringToFront();
await p.selectOption("#themePick", "light");
const forcedLight = await p.evaluate(() => document.documentElement.dataset.theme);
await p.selectOption("#themePick", "sun"); await p.waitForTimeout(200);
ok("Settings can hold the page light or dark, from a new tab's first paint, or hand it back to the sun", forcedDark === "dark" && early === "dark" && forcedLight === "light" && (await p.evaluate(() => localStorage.getItem("theme"))) === null && (await sw.evaluate(async () => (await chrome.storage.sync.get("theme")).theme)) === "sun" && (await p.$$eval("#extras .in-chrome [data-go]", (x) => x.map((b) => b.dataset.go))).some((u) => u.startsWith("chrome://extensions/?id=")), { forcedDark, early, forcedLight });
await p.click('.swatch[data-accent="violet"]');
const tinted = await open(); const hue = await tinted.evaluate(() => [document.documentElement.dataset.accent, getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()]); await tinted.close(); await p.bringToFront();
await p.click('.swatch[data-accent="teal"]');
ok("Settings has four accents; the one chosen travels with the profile and is there from a new tab's first paint", (await p.$$(".swatch")).length === 4 && /^violet,#(6a3fd0|b39cf5)$/.test(hue.join()) && (await p.evaluate(() => document.documentElement.dataset.accent)) === undefined && (await sw.evaluate(async () => (await chrome.storage.sync.get("accent")).accent)) === "teal", hue);
const sheet = await p.evaluate(() => { const s = document.getElementById("extras"); return { fixed: getComputedStyle(s).position, groups: [...s.querySelectorAll("h3")].map((h) => h.textContent) }; });
await p.keyboard.press("Escape"); const byEsc = await p.$eval("#extras", (s) => s.hidden);
await p.click("#extrasBtn"); await p.mouse.click(40, 500); const byPress = await p.$eval("#extras", (s) => s.hidden);
ok("Settings is one sheet over the page, in groups, and Esc or a press outside it puts it away", sheet.fixed === "fixed" && sheet.groups.join() === "Look,Bring in your links,Extras, off until you switch them on,Kept in Chrome" && byEsc && byPress, sheet);
await p.click("#extrasBtn");
ok("Edit is a pencil with a name for screen readers; the bookmark manager shows only while editing", (await p.getAttribute("#edit", "aria-label")) === "Edit this page" && !!(await p.$("#edit svg")) && !(await p.isVisible('[data-go="chrome://bookmarks/"]')));
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
ok("a right-click on a page or a link offers Add to Up next", await sw.evaluate(async () => { await chrome.contextMenus.update("next", {}); return chrome.contextMenus.onClicked.hasListeners(); }));
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
ok("a space tab dragged onto another reorders the bookmarks bar", (await p.$$eval("#spaces .tab:not(.add-space)", (x) => x.map((e) => e.textContent))).join() === "📖 Product,🏢 Work" && (await tree()).children[0].children[0].title === "📖 Product");
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
await p.click("#noteBig");
const big = await p.evaluate(() => { const b = document.querySelector(".notes").getBoundingClientRect(); return { w: b.width, h: document.getElementById("note").getBoundingClientRect().height, fixed: getComputedStyle(document.querySelector(".notes")).position, focus: document.activeElement.id, label: document.getElementById("noteBig").textContent }; });
await p.press("#note", "Escape");
ok("Expand lifts the same note into a big box, and Esc puts it back", big.w >= 700 && big.h > 400 && big.fixed === "fixed" && big.focus === "note" && big.label === "Shrink" && !(await p.$(".notes.big")) && (await p.inputValue("#note")) === "call the accountant", big);
await p.click("#noteBig"); await p.mouse.click(30, 600);
ok("a press outside the big note puts it back too; the small box is only for jotting, its buttons come with the big one", !(await p.$(".notes.big")) && !(await p.isVisible("#noteNew")) && !(await p.isVisible("#noteDelete")));
await p.click("#noteBig");
const noteSaved = () => p.waitForFunction(() => document.getElementById("noteState").textContent === "saved", null, { timeout: 4000 }).catch(() => {});
const onePage = { tabs: await p.isVisible("#notePages"), last: await text(p, "#noteDelete") };
await p.click("#noteNew"); await p.fill("#note", "Trip ideas\nLisbon in May"); await noteSaved();
const pagesNow = () => p.$$eval("#notePages .np", (x) => x.map((b) => `${b.textContent}${b.getAttribute("aria-selected") === "true" ? "*" : ""}`));
const two = await pagesNow();
const stored = await sw.evaluate(() => chrome.storage.sync.get(null));
ok("Notes can be several pages, each named by its first line and saved as its own synced value", !onePage.tabs && onePage.last === "Clear" && two.join() === "call the accountant,Trip ideas*" && stored.notePages.length === 2 && stored.notePages[0] === "note" && stored[stored.notePages[1]] === "Trip ideas\nLisbon in May" && stored.note === "call the accountant", [two, stored.notePages]);
const [noteFile] = await Promise.all([p.waitForEvent("download"), p.click("#noteSave")]);
ok("a page of notes downloads as a text file named after it", noteFile.suggestedFilename() === "Trip ideas.txt" && fs.readFileSync(await noteFile.path(), "utf8") === "Trip ideas\nLisbon in May", noteFile.suggestedFilename());
await p.click("#noteCopy"); await p.waitForFunction(() => document.getElementById("noteState").textContent !== "saved", null, { timeout: 4000 }).catch(() => {});
ok("Copy puts the page on the clipboard, or selects it where the browser won't", ["copied", "selected, ready to copy"].includes(await text(p, "#noteState")), await text(p, "#noteState"));
await p.click("#noteDelete"); await p.waitForFunction(() => /^Deleted Trip ideas/.test(document.getElementById("toast").textContent));
const afterDelete = { tabs: await p.isVisible("#notePages"), value: await p.inputValue("#note") };
await p.click("#toast button"); await p.waitForFunction(() => document.querySelectorAll("#notePages .np").length === 2, null, { timeout: 4000 }).catch(() => {});
const back = await sw.evaluate(() => chrome.storage.sync.get(null));
ok("a deleted page goes with an Undo that puts it back where it was", !afterDelete.tabs && afterDelete.value === "call the accountant" && back.notePages.length === 2 && back[back.notePages[1]] === "Trip ideas\nLisbon in May", [afterDelete, back.notePages]);
await p.click("#notePages .np >> nth=1"); await p.click("#noteDelete"); await p.waitForFunction(() => !document.getElementById("toast").hidden && /^Deleted/.test(document.getElementById("toast").textContent));
await p.waitForFunction(() => document.getElementById("notePages").hidden);
await p.keyboard.press("Escape");

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
const banking = find(await tree(), "💵 Banking");
await p.click(`.card[data-folder="${banking.id}"] .act button:has-text("Add group")`); await p.waitForSelector(".rename"); await p.fill(".rename", "Receipts"); await p.keyboard.press("Enter"); await p.waitForSelector('.group h3:text-is("Receipts")');
ok("Add group makes a folder inside the collection, shown as an empty headed group that can be deleted", find(await tree(), "Receipts").parentId === banking.id && /Drag a link here/.test(await text(p, `.group[data-folder="${find(await tree(), "Receipts").id}"]`)) && !!(await p.$(`.group[data-folder="${find(await tree(), "Receipts").id}"] .danger`)));
ok("in Edit a + follows the spaces", (await p.isVisible("#spaces .add-space")) && (await text(p, "#spaces .add-space")) === "+");
await p.click("#spaces .add-space"); await p.waitForSelector("#spaces .rename"); await p.fill("#spaces .rename", "🧪 Lab"); await p.keyboard.press("Enter"); await p.waitForSelector('#spaces .tab[aria-selected="true"]:has-text("Lab")');
const bar = async () => (await tree()).children[0].children.map((c) => c.title);
ok("+ makes a space, a folder on the bookmarks bar, names it and opens it", (await bar()).join() === "📖 Product,🏢 Work,🧪 Lab" && /Nothing here yet/.test(await text(p, "#collections")), await bar());
await p.click('#spaces .tab[aria-selected="true"]'); await p.waitForSelector("#spaces .rename"); await p.fill("#spaces .rename", "🧪 Labs"); await p.keyboard.press("Enter"); await p.waitForSelector('#spaces .tab:has-text("Labs")');
ok("in Edit, a click on the space you are in renames it", (await bar()).at(-1) === "🧪 Labs");
await p.click('#collections button:has-text("Delete this empty space")'); await p.waitForFunction(() => document.querySelectorAll("#spaces .tab:not(.add-space)").length === 2);
ok("an empty space can be deleted, and the page moves to another", (await bar()).join() === "📖 Product,🏢 Work" && !!(await p.$('#spaces .tab[aria-selected="true"]')));
await p.click('#spaces .tab:has-text("Work")'); await p.waitForSelector(`.card[data-folder="${banking.id}"]`);
await p.click("#edit");
ok("out of Edit the + is gone", !(await p.isVisible("#spaces .add-space")));

await p.click("#saveTabs"); await p.waitForTimeout(500);
const saved = find(await tree(), "🏢 Work").children.find((c) => c.title.startsWith("🗂️ Tabs"));
ok("Save all makes a collection of the open tabs", !!saved && saved.children.length === 2);
await p.hover(`.card[data-folder="${ws.id}"]`); await p.click(`.card[data-folder="${ws.id}"] .card-head .mini`); await p.waitForTimeout(900);
const groups = await sw.evaluate(async () => { const g = await chrome.tabGroups.query({}); const t = await chrome.tabs.query({}); return { titles: g.map((x) => x.title), grouped: t.filter((x) => x.groupId !== -1).length }; });
ok("Open all makes one named tab group", groups.titles.join() === "✉️ Workspace" && groups.grouped === (await titles("✉️ Workspace")).length, groups);

// ---------- shortcuts page ----------
await p.bringToFront(); await p.click('#pages .tab:has-text("Shortcuts")'); await p.waitForSelector(".sc-card");
const readOnly = { pencil: await p.isVisible("#edit"), form: await p.isVisible(".sc-add"), suggest: await p.isVisible(".sc-suggest"), pill: await p.$eval("#scBody button.key", (b) => getComputedStyle(b).pointerEvents), tryBox: !!(await p.$("#tryBar")) };
await p.click("#edit");
ok("Shortcuts is read until the pencil is on: then names can be clicked to change, and your own added and removed", readOnly.pencil && !readOnly.form && !readOnly.suggest && readOnly.pill === "none" && !readOnly.tryBox && (await p.isVisible(".sc-add")) && (await p.$eval("#scBody button.key", (b) => getComputedStyle(b).pointerEvents)) !== "none", readOnly);
const keys = () => p.$$eval("#scBody .key", (x) => x.map((e) => e.textContent));
ok("Always there lists Google's apps and Claude, bookmarked or not, and no plain web search", (await p.$$eval(".key.fixed", (x) => x.map((e) => e.textContent))).join() === "mail/,cal/,drive/,docs/,sheets/,slides/,keep/,claude/");
const always = (name) => p.$eval(`.sc-row:has(.key:text-is("${name}/")) .sc-what`, (a) => `${a.textContent}|${a.getAttribute("href")}`);
ok("a built-in you have bookmarked opens your bookmark; one you haven't opens the app", (await always("cal")) === "Google Calendaryour bookmark|https://calendar.google.com/calendar/u/0/r" && (await always("docs")) === "Google Docs|https://docs.google.com/document/", [await always("cal"), await always("docs")]);
ok("each name is on the page once: claude/ is the Claude bookmark, and a page saved from inside Claude has its own", (await keys()).filter((k) => k === "claude/").length === 1 && (await keys()).filter((k) => k === "mail/").length === 1 && !(await keys()).some((k) => ["calendar/", "gmail/"].includes(k)) && (await text(p, '.sc-row:has-text("claude.ai") .key')) === "plan/", await keys());
ok("each built-in shows what a search with it looks like", /mail\/invoice/.test(await text(p, '.sc-row:has(.key:text-is("mail/")) .sc-note')) && /cal\/dentist/.test(await text(p, '.sc-row:has(.key:text-is("cal/")) .sc-note')));
const platform = find(await tree(), "🧰 Platform");
await sw.evaluate(async (parentId) => { for (const [title, url] of [["Google Cloud console", "https://console.cloud.google.com/"], ["Google Ads", "https://ads.google.com/"], ["Docs", "https://docs.product.example/"]]) await chrome.bookmarks.create({ parentId, title, url }); }, platform.id);
await p.waitForFunction(() => [...document.querySelectorAll("#scBody .key")].some((k) => k.textContent === "googleads/"));
const nameOf = (title) => p.$eval(`.sc-row:has(.t:text-is("${title}")) .key`, (k) => k.textContent);
ok("a new bookmark is named at once by the fewest leading words no other bookmark starts with", (await nameOf("Google Cloud console")) === "googlecloud/" && (await nameOf("Google Ads")) === "googleads/" && (await nameOf("Admin console")) === "admin/", [await nameOf("Google Cloud console"), await nameOf("Google Ads")]);
ok("a bookmark named like a built-in app that isn't that app gets no name of its own, and says so", (await nameOf("Docs")) === "set a name" && (await go("http://docs/")) === "https://docs.google.com/document/");
ok("Chrome's own pages have names too, listed with the key that saves a page", (await p.$$eval(".key.page", (x) => x.map((e) => e.textContent))).join() === "history/,downloads/,bookmarks/,settings/,extensions/,passwords/" && /adds the page you are on to Up next\.$|No key is set/.test(await text(p, '.sc-card:has(h2:text-is("Chrome\'s own pages")) .sc-note.solo')) && !!(await p.$('#scBody [data-go="chrome://extensions/shortcuts"]')));
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
ok("docs/board-minutes and cal/dentist search inside those apps, bookmarked or not", (await go("http://docs/board-minutes")) === "https://docs.google.com/document/u/0/?q=board%20minutes" && (await go("http://cal/dentist")) === "https://calendar.google.com/calendar/u/0/r/search?q=dentist", [await go("http://docs/board-minutes"), await go("http://cal/dentist")]);
const asked = async (u) => { const r = new URL(await go(u)); return `${r.hostname}${r.pathname}?q=${r.searchParams.get("q")}`; };
ok("words after any other link's name search the web for its site, on Chrome's own search engine", (await asked("http://pay/refund-policy")) === "www.google.com/search?q=refund policy site:stripe.com" && (await asked("http://admin/users")) === "www.google.com/search?q=users site:admin.google.com", [await asked("http://pay/refund-policy"), await asked("http://admin/users")]);
ok("typed with spaces it does the same", (await asked("https://www.google.com/search?q=pay%2Frefund+policy")) === "www.google.com/search?q=refund policy site:stripe.com", await asked("https://www.google.com/search?q=pay%2Frefund+policy"));
ok("history/ and settings/ open Chrome's own pages, and words search inside them", /^chrome:\/\/history\/\?q=that(\+|%20)recipe$/.test(await go("http://history/that-recipe")) && (await go("http://settings/")) === "chrome://settings/" && (await go("https://www.google.com/search?q=downloads%2Finvoice")) === "chrome://downloads/?q=invoice", [await go("http://history/that-recipe"), await go("http://settings/")]);
ok("g/ is no longer a shortcut: plain words are what the address bar already searches", (await go("http://g/best-pizza")) === "http://g/best-pizza");
ok("tasks/ and unknown words are left alone", (await go("http://tasks/")) === "http://tasks/" && (await go("http://nope/")) === "http://nope/");
ok("real sites are left alone", (await go("https://example.com/x")) === "https://example.com/x");
// With a space in it, Chrome searches for what was typed; that search is read as the short link.
ok("claude/what is a tsunami? (typed with spaces, so searched) → Claude with the question", (await go("https://www.google.com/search?q=claude%2Fwhat+is+a+tsunami%3F&oq=claude")) === "https://claude.ai/new?q=what%20is%20a%20tsunami%3F");
ok("mail/invoice from stripe, searched on another engine → Gmail search", (await go("https://duckduckgo.com/?q=mail%2Finvoice+from+stripe")).startsWith("https://mail.google.com/mail/u/0/#search/invoice%20from%20stripe"));
ok("a search only counts for a whole short name", (await go("https://www.google.com/search?q=adm%2Fusers")).includes("google.com/search") && (await go("https://www.google.com/search?q=and%2For+logic")).includes("google.com/search") && (await go("https://www.google.com/search?q=plain+words")).includes("google.com/search"));

// ---------- find, and links as a list ----------
await p.bringToFront(); await p.click('#spaces .tab:has-text("Work")'); await p.waitForSelector(".card");
await p.keyboard.press("/");
const typedInto = await p.evaluate(() => document.activeElement.id);
await p.fill("#findBox", "strip"); await p.waitForFunction(() => document.querySelectorAll("#findList li").length > 0);
const rowsFound = () => p.$$eval("#findList .find-row", (x) => x.map((a) => `${a.querySelector(".t").textContent}|${a.querySelector(".h").textContent}|${a.querySelector(".key") ? a.querySelector(".key").textContent : ""}`));
const found = await rowsFound();
const inPlace = await p.evaluate(() => ({ finding: document.body.classList.contains("finding"), space: getComputedStyle(document.getElementById("space")).display, list: !document.getElementById("find").hidden, inBar: !!document.querySelector(".top #findBox"), popup: getComputedStyle(document.getElementById("find")).position }));
await p.fill("#findBox", "example.org"); await p.waitForTimeout(150); const tabsFound = await rowsFound();
await p.fill("#findBox", "zzzz"); const noneSaid = await text(p, "#findSay");
await p.keyboard.press("Escape");
ok("Find is a field in the top bar, reached with /: what matches, in any space, stands in for the page while something is typed, each with where it is and its short name, and the open tabs", typedInto === "findBox" && inPlace.finding && inPlace.space === "none" && inPlace.list && inPlace.inBar && inPlace.popup === "static" && /^Stripe\|🏢 Work › .+\|[a-z]+\/$/.test(found[0]) && tabsFound.some((r) => r.endsWith("|Open tab|")) && noneSaid === "Nothing you keep matches “zzzz”. Enter searches the web for it.", [found, tabsFound, inPlace]);
ok("Esc clears it and the page is back", (await p.inputValue("#findBox")) === "" && (await p.$eval("#find", (s) => s.hidden)) && !(await p.evaluate(() => document.body.classList.contains("finding"))) && (await p.isVisible(".card")));
await p.fill("#findBox", "bank"); await p.click('#pages .tab:has-text("Shortcuts")'); const leftFind = await p.inputValue("#findBox"); await p.click('#spaces .tab:has-text("Work")'); await p.waitForSelector(".card");
ok("going to another page clears it too", leftFind === "");
const fq = await open(); await fq.waitForSelector(".card"); await fq.fill("#findBox", "bank"); await fq.waitForFunction(() => document.querySelectorAll("#findList li").length > 0); await fq.keyboard.press("Enter");
await fq.waitForURL(/examplebank/, { timeout: 5000 }).catch(() => {});
ok("Enter opens the first match", /^https:\/\/app\.examplebank\.com\//.test(fq.url()), fq.url()); await fq.close(); await p.bringToFront();
await p.click("#extrasBtn"); await p.selectOption("#viewPick", "list"); await p.keyboard.press("Escape");
const asList = await p.evaluate(() => { const t = document.querySelector(".card .tile:not(.add)"), k = t.querySelector(".key"), i = t.querySelector(".sico").getBoundingClientRect(), n = t.querySelector(".name").getBoundingClientRect(); return { view: document.documentElement.dataset.view, across: i.right <= n.left && Math.abs((i.top + i.bottom) / 2 - (n.top + n.bottom) / 2) < 6, key: getComputedStyle(k).display !== "none" && /^[a-z0-9]+\/$/.test(k.textContent) }; });
const listed = await open(); const viewEarly = await listed.evaluate(() => document.documentElement.dataset.view); await listed.close(); await p.bringToFront();
await p.click("#extrasBtn"); await p.selectOption("#viewPick", "tiles"); await p.keyboard.press("Escape");
ok("Settings can show links as a list, a row each with its short name beside it, from a new tab's first paint; and back", asList.view === "list" && asList.across && asList.key && viewEarly === "list" && (await p.evaluate(() => document.documentElement.dataset.view)) === undefined, asList);

// ---------- today ----------
await p.bringToFront();
let t0 = Date.now(); await p.click('#pages .tab:has-text("Today")'); await p.waitForSelector(".wx-temp", { timeout: 5000 });
ok("the forecast is on screen within a second and a half", Date.now() - t0 < 1500, { ms: Date.now() - t0 });
ok("a place taken from the computer is named by the forecast", (await text(p, "#place")) === "New York, NY");
ok("clock, sunrise, sunset and day length are drawn", /\d/.test(await text(p, "#bigTime")) && /\d/.test(await text(p, "#rise")) && /\d/.test(await text(p, "#set")) && /daylight/.test(await text(p, "#daylight")), { time: await text(p, "#bigTime"), rise: await text(p, "#rise"), set: await text(p, "#set") });
ok("the light is named, with what comes next and when", ["Daylight", "Golden hour", "Civil twilight", "Nautical twilight", "Astronomical twilight", "Night"].includes(await text(p, "#phase")) && /^(First light|Dawn|Sunrise|Golden hour|Sunset|Dusk|Full dark) in \d/.test(await text(p, "#nextUp")), [await text(p, "#phase"), await text(p, "#nextUp")]);
ok("twilight times and the moon are written out", /dawn \d/i.test(await text(p, "#riseSub")) && /dusk \d/i.test(await text(p, "#setSub")) && /(moon|crescent|quarter|gibbous), \d+% lit/i.test(await text(p, "#moonLine")), [await text(p, "#riseSub"), await text(p, "#setSub"), await text(p, "#moonLine")]);
ok("the sun sits on its path, over the three twilights and night", await p.evaluate(() => +document.getElementById("sunDot").getAttribute("cx") > 0 && document.getElementById("sunPathUp").getAttribute("d").length > 500 && [...document.querySelectorAll(".band-name")].map((n) => n.textContent).join() === "Civil,Nautical,Astronomical,Night"));
ok("now, an hourly chart and seven days", /^\d+°$/.test(await text(p, ".wx-temp")) && !!(await p.$(".hc-line")) && (await p.$$("#wxDays li")).length === 7, { now: await text(p, ".wx-now"), days: await p.$$eval("#wxDays li", (x) => x.map((e) => e.textContent)) });
ok("days are named by date, not by the service's holiday names", (await text(p, "#wxDays li:first-child .d")) === "Today");
ok("no links to mail or calendar on Today", (await p.$$("#today a")).length === 1);
await p.waitForSelector("#radarCard:not([hidden])", { timeout: 4000 }).catch(() => {});
ok("radar shows once its image loads, at the top beside the sky, as wide as its column up to 600 px", !(await p.$("#radarCard[hidden]")) && (await p.$eval("#radarImg", (i) => i.getBoundingClientRect().width)) >= 500 && (await p.$eval("#radarCard", (r) => !!r.closest(".t-now"))) && /_loop\.gif/.test(await p.$eval("#radarImg", (i) => i.src)));

// the next 24 hours: one strip that is the hourly forecast and the handle on the day
const dayNow = () => p.evaluate(() => ({ time: document.getElementById("bigTime").textContent, then: document.getElementById("sky").classList.contains("then"), say: document.getElementById("thenLine").textContent, sun: +document.getElementById("sunDot").getAttribute("cx"), back: !document.getElementById("scrubNow").hidden, mark: document.getElementById("stripMark").getAttribute("transform"), wx: document.getElementById("skyWx").textContent, value: document.getElementById("scrub").value }));
const rest = await dayNow();
ok("under the sky a strip shows the next 24 hours: night shaded, the temperature along it, a name every three hours", (await p.$$("#stripArt .st-night")).length >= 1 && !!(await p.$("#stripArt .hc-line")) && (await p.$$eval("#stripArt .hc-h", (x) => x.map((e) => e.textContent))).length >= 8 && (await p.$$eval("#stripArt .hc-h", (x) => x.at(-1).textContent)) === "Now" && !rest.then && !rest.back && rest.say === "Drag along the day to see any hour of the next 24." && !(await p.$("#wxHours")) && !(await p.$("#worldMap")), rest);
const sb = await p.locator("#stripArt").boundingBox();
await p.mouse.move(sb.x + sb.width * 0.2, sb.y + 30); await p.mouse.down(); await p.mouse.move(sb.x + sb.width * 0.5, sb.y + 30, { steps: 5 }); await p.mouse.up(); await p.waitForFunction(() => /^In 12 h 0 min/.test(document.getElementById("thenLine").textContent), null, { timeout: 4000 }).catch(() => {});
const half = await dayNow();
ok("dragging along it moves the page to that moment: the clock, the sun and that hour's forecast", half.then && half.back && half.value === "720" && half.time !== rest.time && half.sun !== rest.sun && /^In 12 h 0 min: \d+°, /.test(half.say) && half.mark !== rest.mark && /\d+° and /.test(half.wx), half);
await p.focus("#scrub"); await p.keyboard.press("ArrowRight"); await p.waitForFunction(() => /12 h 5 min/.test(document.getElementById("thenLine").textContent), null, { timeout: 4000 }).catch(() => {});
const stepped = await dayNow();
await p.click("#scrubNow"); await p.waitForFunction(() => !document.getElementById("sky").classList.contains("then"), null, { timeout: 4000 }).catch(() => {});
const home = await dayNow();
ok("the keyboard moves it five minutes at a time, and Back to now puts the day back", stepped.value === "725" && /^In 12 h 5 min/.test(stepped.say) && home.value === "0" && !home.then && !home.back && home.time === rest.time && home.say === rest.say, [stepped.say, home]);
await p.mouse.click(sb.x + sb.width * 0.7, sb.y + 30); await p.click('#pages .tab:has-text("Shortcuts")'); await p.click('#pages .tab:has-text("Today")'); await p.waitForSelector(".wx-temp");
ok("leaving Today puts the day back as well", !(await dayNow()).then);

// your places: where you are, and cities you add, pick and see on every space
const chipsNow = (sel = "#places") => p.$$eval(`${sel} .place`, (x) => x.map((b) => `${b.getAttribute("aria-pressed") === "true" ? "*" : ""}${b.querySelector(".p-name").textContent}${b.querySelector("b") ? " " + b.querySelector("b").textContent : ""}`));
const noCities = { chips: await chipsNow(), add: await p.isVisible("#zoneAdd"), form: await p.isVisible("#zoneForm"), pencil: await p.isVisible("#edit") };
await p.click("#zoneAdd");
const editingToday = { on: await p.evaluate(() => document.body.classList.contains("editing")), focus: await p.evaluate(() => document.activeElement.id), ask: await p.isVisible("#todayAsk") };
await p.fill("#zoneInput", "Paris"); await p.click("#zoneForm .btn"); await p.waitForFunction(() => /Paris/.test(document.getElementById("place").textContent), null, { timeout: 6000 }).catch(() => {});
const paris = { chips: await chipsNow(), place: await text(p, "#place"), saved: await sw.evaluate(async () => (await chrome.storage.sync.get("zones")).zones), view: await sw.evaluate(async () => (await chrome.storage.local.get("view")).view), home: (await place()).source, time: await text(p, "#bigTime"), x: await p.isVisible(".place-wrap .x") };
ok("with no cities Today offers to add one, which turns the pencil on: there the place is changed and cities added", noCities.chips.length === 0 && noCities.add && !noCities.form && noCities.pencil && editingToday.on && editingToday.focus === "zoneInput" && editingToday.ask, [noCities, editingToday]);
ok("a city is added by name with its time zone, picked at once, and Today is drawn for it in its own time; where you are is not changed", paris.saved.length === 1 && paris.saved[0].zone === "Europe/Paris" && net.zones.join() === "48.86,2.35" && paris.view.tz === "Europe/Paris" && paris.place === "Paris, Île-de-France, France" && paris.home === "device" && /^\*Paris \S/.test(paris.chips[1]) && /^📍 Here \d/.test(paris.chips[0]) && paris.time !== rest.time && paris.x, paris);
await p.click("#edit");
await p.click('#spaces .tab:has-text("Work")'); await p.waitForSelector(".card"); await p.waitForFunction(() => /Paris/.test(document.getElementById("glPlace").textContent), null, { timeout: 4000 }).catch(() => {});
const strip = { chips: await chipsNow("#glZones"), place: await text(p, "#glPlace"), clock: await text(p, "#glTime") };
ok("the pick shows on every space: the strip names the place, lists your cities with their clocks, and keeps your own clock at the left", strip.place === "📍 Paris, Île-de-France, France" && strip.chips[0] === "Here" && /^\*Paris \S/.test(strip.chips[1]) && /^\d+:\d\d [AP]M$/.test(strip.clock), strip);
await p.click('#glZones .place:has-text("Here")'); await p.waitForFunction(() => !document.getElementById("glPlace").textContent, null, { timeout: 4000 }).catch(() => {});
const backHere = { chips: await chipsNow("#glZones"), view: await sw.evaluate(async () => (await chrome.storage.local.get("view")).view) };
ok("Here goes back to where you are, and the city stays in the row to pick again", backHere.chips.length === 1 && /^Paris \S/.test(backHere.chips[0]) && backHere.view === undefined, backHere);
await p.click('#pages .tab:has-text("Today")'); await p.waitForSelector(".wx-temp"); await p.click("#edit"); await p.click(".place-wrap .x"); await p.waitForFunction(() => !document.querySelector("#places .place"), null, { timeout: 4000 }).catch(() => {});
ok("with the pencil on, a city is removed", (await sw.evaluate(async () => (await chrome.storage.sync.get("zones")).zones)).length === 0 && (await chipsNow()).length === 0);
await p.click("#edit"); await p.waitForSelector("#radarCard:not([hidden])", { timeout: 5000 }).catch(() => {});
await p.setViewportSize({ width: 760, height: 900 });
const stacked = await p.evaluate(() => { const s = document.getElementById("sky").getBoundingClientRect(), r = document.getElementById("radarCard").getBoundingClientRect(); return r.top >= s.bottom - 1 && document.documentElement.scrollWidth <= innerWidth; });
await p.setViewportSize({ width: 1360, height: 900 });
ok("on a narrow window the radar drops under the sky and nothing runs off the side", stacked);
net.searches.length = 0;

// changing the place: a city, a ZIP code, a street address, a place abroad, nothing at all
const search = async (words, choose) => {
  if (await p.$("#todayAsk[hidden]")) await p.click("#placeBtn");
  await p.fill("#todayAskForm input", words); await p.click('#todayAskForm button:has-text("Search")');
  if (choose) { await p.waitForSelector("#todayAskForm .place-hits button"); const labels = await p.$$eval("#todayAskForm .place-hits button", (x) => x.map((e) => e.textContent)); await p.click("#todayAskForm .place-hits button"); return labels; }
};
const settled = (name) => p.waitForFunction((n) => document.getElementById("place").textContent === n && document.querySelector(".wx-temp"), name, { timeout: 8000 }).catch(() => {});
let offered = await search("Oakland", true);
await settled("Oakland, California");
ok("a typed city with more than one match is offered as a choice; the pick becomes the place and its forecast is fetched, with one search per press", offered.join("; ") === "Oakland, California; Oakland County, Michigan" && (await place()).source === "typed" && (await text(p, "#place")) === "Oakland, California" && net.points.at(-1) === "37.8,-122.27" && net.searches.join() === "Oakland", { offered, place: await place(), lookups: net.points });
offered = await search("94103", true);
await settled("San Francisco, California");
ok("a ZIP code works: this country's match comes first, named by its town", offered[0] === "94103, San Francisco, California" && (await place()).lat === 37.77 && (await text(p, "#place")) === "San Francisco, California", offered);
await search("Oakland", true); await settled("Oakland, California");
await search("1 Market St, San Francisco");
await settled("San Francisco, California");
ok("a street address works: its matches are one town, so it is set without a second click", (await place()).name === "San Francisco, California" && (await place()).lat === 37.79 && !!(await p.$("#todayAsk[hidden]")), await place());
await search("Paris");
await p.waitForFunction(() => /United States/.test(document.getElementById("wxNote").textContent), null, { timeout: 8000 }).catch(() => {});
ok("outside the United States it says there is no forecast, and the sky still works", /National Weather Service covers the United States/.test(await text(p, "#wxNote")) && !(await p.$(".wx-temp")) && (await text(p, "#place")) === "Paris, Île-de-France, France" && /\d/.test(await text(p, "#rise")) && !!(await text(p, "#phase")), await text(p, "#wxNote"));
await search("nowhere");
await p.waitForFunction(() => /Nothing found/.test(document.querySelector("#todayAskForm .note").textContent), null, { timeout: 5000 }).catch(() => {});
ok("a search with no match says so and suggests what to type", (await text(p, "#todayAskForm .note")) === "Nothing found for “nowhere”. Try a city and state, or a ZIP code." && (await place()).name.startsWith("Paris"));
await p.click('#todayAskForm button:has-text("Use this computer")');
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
ok("a full moon is up at midnight and drawn full", s.moon && /Full moon, (99|100)% lit/.test(s.line) && / 0 0 1 -11 0 Z$/.test(s.lit), s);
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

// ---------- tools ----------
await p.bringToFront();
ok("nothing on the launcher itself has asked the Tools services anything", net.tools.length === 0, net.tools);
await p.click('#pages .tab:has-text("Tools")'); await p.waitForSelector(".ways .way", { timeout: 30000 });
const tool = (name) => `.tool:has(h2:has-text("${name}"))`;
const hero = async (q = p) => ({ line: await text(q, "#heroLine"), sub: await text(q, ".hero-sub"), ip: await text(q, ".hero-ip code"), map: await q.getAttribute(".world svg", "aria-label"), route: await q.$$eval(".world .route", (x) => x.map((r) => r.getAttribute("d").slice(0, 1)).join()), pins: await q.$$eval(".world .pin", (x) => x.map((g) => `${g.getAttribute("class")}:${g.querySelector("text").textContent}`)), ways: await q.$$eval(".way", (x) => x.map((w) => `${w.className.replace("way ", "")}|${w.querySelector(".way-name").textContent}|${w.querySelector(".way-say b").textContent}|${w.querySelector(".mk").textContent}`)), why: await q.$$eval(".way", (x) => x.map((w) => [...w.querySelectorAll(".way-why, .resolvers li")].map((e) => e.textContent).join(" "))) });
let seen = await hero();
ok("opening Tools runs the check by itself, and not the speed reading, which spends data", net.tools.includes("v4") && net.tools.filter((x) => x === "dns").length === 4 && net.tools.filter((x) => x === "lookup").length === 3 && !net.tools.includes("__down") && (await text(p, `${tool("Speed")} .btn`)) === "Run", net.tools);
ok("the check lands as a sentence: where you come out, how far that is, and the address", seen.line === "You come out in Stockholm, Sweden. 🇸🇪" && /^That is 6,3\d0 km from your place, so a VPN or proxy is carrying you\.$/.test(seen.sub) && seen.ip === "203.0.113.7" && (await p.isVisible('.hero-ip button:has-text("Copy")')), seen);
ok("and as a map: your place, where you come out, and the way round the world between them", seen.pins.join() === "pin you:You,pin exit:Stockholm" && seen.route === "M" && /^Your traffic comes out in Stockholm, Sweden, 6,3\d0 km from your place$/.test(seen.map) && (await p.$eval(".world .land", (l) => l.getAttribute("d").split("M").length - 1)) === 1636 && (await p.$eval(".world", (w) => w.classList.contains("landed") && !w.classList.contains("busy"))), [seen.pins, seen.map]);
ok("four answers sit under it, each a sign and words, never colour alone", seen.ways[0] === "plain|Your provider|Example Networks|" && seen.ways[1] === "plain|Your clock|Differs from your address|" && /^(good\|Video calls \(WebRTC\)\|(Shows nothing|No leak)\|✓|bad\|Video calls \(WebRTC\)\|Shows another address\|✕)$/.test(seen.ways[2]) && seen.ways[3] === "warn|Name lookups (DNS)|Answered in United States|!", seen.ways);
ok("under them a plain list says what each kind of tool would change and what it wouldn't: no product named, nothing to buy; and this computer's location is offered only while no place is set", (await p.$$eval(".gaps .gap b", (x) => x.map((b) => b.textContent))).join() === "A VPN,Secure DNS,A tracker blocker,A private window" && (await p.$$("#tools .gaps a")).length === 0 && (await p.$eval(".gaps .gap .state", (s) => s.textContent)) === "You look to be on one" && (await p.$$eval(".gaps .gap p", (x) => x.length)) === 8 && (await p.$eval(".hero-say .act", (b) => b.hidden && b.textContent === "Use this computer's location")));
const todo = await p.$$eval(".way .way-do", (x) => x.map((e) => e.textContent));
const fixes = seen.ways.filter((w) => /^(bad|warn)\|/.test(w)).length;
ok("over them one line counts what needs fixing, and every answer ends with what to do, even when that is nothing", (await text(p, "#heroDo")) === `${seen.ways.some((w) => w.startsWith("bad")) ? "✕" : "!"}${fixes} thing${fixes === 1 ? "" : "s"} to fix. ${fixes === 1 ? "It is" : "They are"} marked below, with what to do.` && todo.length === 4 && todo[0] === "Nothing to do." && /^It only matters if you want to pass for being there\./.test(todo[1]) && /Use secure DNS/.test(todo[3]) && /server where that site is/.test(seen.why[3]) && /connect two computers directly/.test(seen.why[2]), [await text(p, "#heroDo"), todo]);
ok("a sign is kept for what matters and can be acted on: the clock is a plain fact, and what is going around the VPN comes with the thing to do about it", (await p.$$eval(".way .act", (x) => x.map((b) => `${b.closest(".way").querySelector(".way-name").textContent}:${b.textContent}:${b.dataset.go || ""}`))).join() === (seen.ways[2].startsWith("bad") || /local network is visible/.test(seen.why[2]) ? "Video calls (WebRTC):Limit WebRTC to your browsing's route:," : "") + "Name lookups (DNS):Choose your DNS in Chrome:chrome://settings/security", await p.$$eval(".way .act", (x) => x.map((b) => b.textContent)));
ok("each says what it means: the network's number, the two clocks, and whose servers answer your lookups and where", /AS64500/.test(seen.why[0]) && /No IPv6 address on this network\./.test(seen.why[0]) && /Your clock says America\/New_York; your address says Europe\/Stockholm\. A site can tell you are not where your address is\./.test(seen.why[1]) && /Example DNS Inc\., 3 servers/.test(seen.why[3]) && /Not in Sweden where your traffic comes out\. On a VPN, that means lookups are going around it\./.test(seen.why[3]), seen.why);
net.exitNear = true; net.dnsHome = true;
await p.click('.hero-say .btn:has-text("Check again")'); await p.waitForFunction(() => /New York/.test(document.getElementById("heroLine").textContent) && document.querySelectorAll(".way").length === 4 && !document.querySelector(".hero-say .btn").disabled, null, { timeout: 30000 });
seen = await hero();
ok("with nothing carrying you elsewhere, Check again says so on the map, and the answers are plain facts with no verdicts to worry over", seen.line === "You come out in New York, United States. 🇺🇸" && /^That is where you are, near enough\./.test(seen.sub) && seen.pins.join() === "pin you here:New York, United States" && seen.route === "" && seen.ways.every((w) => w.startsWith("plain|")) && seen.ways[1] === "plain|Your clock|Matches|" && seen.ways[3] === "plain|Name lookups (DNS)|Your own network|" && /^Nothing here needs fixing\. Without a VPN your provider can see which sites you visit/.test(await text(p, "#heroDo")) && !(await p.$("#heroDo .mk")), seen);
ok("without a VPN the one thing offered is a choice, not a fix: who answers your lookups", (await p.$$eval(".way .act[data-go]", (x) => x.map((b) => `${b.textContent}:${b.dataset.go}`))).join() === "Choose your DNS in Chrome:chrome://settings/security" && /^Nothing needs doing\. If you would rather your provider didn't see every name/.test(await p.$eval(".way:nth-child(4) .way-do", (e) => e.textContent)));
const fp = await text(p, "#fpId");
const made = await p.$$eval(".tier", (x) => x.map((t) => `${t.querySelector("h3").textContent}: ${[...t.querySelectorAll("dt")].map((d) => d.textContent).join(", ")}`));
ok("the fingerprint is drawn as a mark with its number, and says in a sentence what it means", /^[0-9a-f]{4}-[0-9a-f]{4}$/.test(fp) && (await p.$$eval(".whorl circle", (x) => x.length)) === 7 && (await text(p, ".fp-line")) === "A site can know this browser again without a cookie." && /from the \d+ things below/.test(await text(p, tool("Fingerprint"))), fp);
ok("what it is made of is in plain words, sorted by how far each narrows you down", /^Narrows you down a lot: How it draws, Graphics/.test(made[0]) && /^Some: .*Browser, System, Screen/.test(made[1]) && /^A little: Time zone, Languages/.test(made[2]) && (await p.$$eval(".tier dd", (x) => x.every((d) => d.textContent.length > 1 && d.title.length > 1))) && /^(Chromium|Chrome|HeadlessChrome) \d+$/.test(await p.$eval(".tier dt:text-is('Browser') + dd", (d) => d.textContent)), made);
ok("the only links on the page are the two that can say how rare the mark is", (await p.$$eval("#tools a", (x) => x.map((e) => new URL(e.href).hostname))).join() === "coveryourtracks.eff.org,amiunique.org");
await p.click(`${tool("Speed")} .btn`); await p.waitForSelector(`${tool("Speed")} .btn:has-text("again"):not([disabled])`, { timeout: 30000 });
const sp = await p.$$eval(`${tool("Speed")} .meter`, (x) => x.map((m) => `${m.querySelector(".m-name").textContent} ${m.querySelector("b").textContent} ${m.querySelector(".m-bar i").style.width}`));
ok("Speed runs on a press, reads download and upload onto bars and gives the delay", sp.length === 2 && sp.every((s) => /^(Download|Upload) [\d.,]+ [\d.]+%$/.test(s)) && /^Delay \d+ ms, give or take \d+\./.test(await text(p, `${tool("Speed")} .sc-note`)) && net.tools.includes("__up") && net.tools.filter((x) => x === "__down").length >= 8, sp);
ok("and says what that speed is good for in a household's terms", /^(Fast|Good|Fine|Slow|Very slow)[. ]/.test(await text(p, "#speedMeans")), await text(p, "#speedMeans"));
ok("the fingerprint says what can and can't be done about it", /^What to do: there is no switch for this in Chrome/.test(await text(p, `${tool("Fingerprint")} .way-do`)));
ok("Chrome's privacy switches wait for the permission to read them", (await text(p, `${tool("privacy switches")} .btn`)) === "Show them" && !(await p.$(".switches")) && manifest.optional_permissions.includes("privacy"));
await p.click('#pages .tab:has-text("Today")'); await p.click('#pages .tab:has-text("Tools")');
ok("what was found stays while the tab is open", /New York/.test(await text(p, "#heroLine")) && /^Delay/.test(await text(p, `${tool("Speed")} .sc-note`)) && (await text(p, "#fpId")) === fp);
const p2 = await open(); await p2.waitForSelector(".card"); await p2.click('#pages .tab:has-text("Tools")'); await p2.waitForSelector("#fpId");
ok("the mark is the same in another tab", (await text(p2, "#fpId")) === fp);
await p2.waitForSelector(".ways .way", { timeout: 30000 }); await p2.close(); await p.bringToFront();

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
ok("the extras ship switched off, as optional permissions", !!(await q.$("#glMail[hidden]")) && !!(await q.$("#filesPanel[hidden]")) && !!(await q.$("#closedPanel[hidden]")) && !!(await q.$("#often[hidden]")) && manifest.optional_permissions.join() === "history,privacy,sessions,topSites" && manifest.optional_host_permissions.join() === "https://mail.google.com/*" && !manifest.permissions.includes("history"));
await q.click("#extrasBtn"); await q.waitForSelector("#extrasBody .extra");
ok("Settings lists the extras, all off", (await q.$$eval("#extrasBody .extra .btn", (x) => x.map((e) => `${e.getAttribute("aria-label")}:${e.textContent}`))).join() === "Unread mail:Off,Recent files:Off,Closed tabs and other devices:Off,Most visited:Off");

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
const gone = await g.ctx.newPage(); await gone.goto("https://example.com/closed-page"); await gone.waitForTimeout(300); await gone.close();
await e.bringToFront();
await e.waitForFunction(() => [...document.querySelectorAll("#closed .row")].some((r) => r.getAttribute("href") === "https://example.com/closed-page"), null, { timeout: 8000 }).catch(() => {});
ok("with its permission, a tab you just closed is listed under Recently closed", !(await e.$("#closedPanel[hidden]")) && (await e.$$eval("#closed .row", (x) => x.map((r) => r.getAttribute("href")))).includes("https://example.com/closed-page"), await e.$$eval("#closed .row", (x) => x.map((r) => r.getAttribute("href"))));
await e.click('#closed .row[href="https://example.com/closed-page"]');
await e.waitForFunction(() => chrome.tabs.query({ url: "https://example.com/closed-page" }).then((t) => t.length === 1) && true).catch(() => {}); await e.waitForTimeout(800);
ok("a click reopens it", (await g.sw.evaluate(async () => (await chrome.tabs.query({ url: "https://example.com/closed-page" })).length)) === 1);
await e.bringToFront();
ok("with its permission, Most visited draws without complaint (a new profile has none yet)", (await e.$$eval("#often .pin", (x) => x.length)) >= 0 && (await g.sw.evaluate(async () => Array.isArray(await chrome.topSites.get()))));
await e.click('#pages .tab:has-text("Tools")'); await e.waitForSelector(".switches");
const sw0 = await e.evaluate(() => ({ tally: document.querySelector(".sw-tally").textContent, bars: document.querySelectorAll(".score i").length, good: document.querySelectorAll(".score i.on").length, groups: [...document.querySelectorAll(".sw-group")].map((g) => `${g.querySelector("h3").textContent}:${[...g.querySelectorAll(".sw")].map((s) => s.className.replace("sw ", "")).join("")}`), names: [...document.querySelectorAll(".sw .sw-say b")].map((b) => b.textContent), states: [...document.querySelectorAll(".sw .state")].map((s) => s.textContent), signs: [...document.querySelectorAll(".sw.warn .mk")].map((m) => m.textContent).join(""), go: [...document.querySelectorAll(".sw [data-go]")].map((b) => b.dataset.go), route: document.getElementById("rtcRoute").value, locked: document.getElementById("rtcRoute").disabled }));
ok("with its permission, Chrome's privacy switches are read and scored: what is worth a look first, then what is already private, then the trades that are yours to make, which get no verdict", /^\d+ of \d+ set the private way$/.test(sw0.tally) && sw0.bars >= 5 && sw0.good === +sw0.tally.split(" ")[0] && /^Worth a look:(bad)*(warn)+$/.test(sw0.groups[0]) && /^Already private:(good)+$/.test(sw0.groups[1]) && /^Your call:(plain)+$/.test(sw0.groups[2]) && /^!+$/.test(sw0.signs) && sw0.bars === sw0.names.length - 4 && ["Third-party cookies", "Safe Browsing", "Preload pages"].every((s) => sw0.names.includes(s)) && sw0.states.length === sw0.names.length && sw0.go.includes("chrome://settings/cookies") && sw0.route === "default" && !sw0.locked, sw0);
await e.selectOption("#rtcRoute", "default_public_interface_only");
await e.waitForFunction(() => document.getElementById("rtcRoute") && document.getElementById("rtcRoute").value === "default_public_interface_only");
const held = await g.sw.evaluate(() => chrome.privacy.network.webRTCIPHandlingPolicy.get({}));
await e.selectOption("#rtcRoute", "default"); await e.waitForTimeout(500);
const freed = await g.sw.evaluate(() => chrome.privacy.network.webRTCIPHandlingPolicy.get({}));
ok("the WebRTC route, which Chrome has no switch for, is set here and handed back by choosing the default", held.value === "default_public_interface_only" && held.levelOfControl === "controlled_by_this_extension" && freed.value === "default" && freed.levelOfControl === "controllable_by_this_extension", [held, freed]);
await e.waitForSelector(".way .act"); const fix = await e.$('.way .act:has-text("Limit WebRTC")');
if (fix) { await fix.click(); await e.waitForFunction(() => document.getElementById("rtcRoute") && document.getElementById("rtcRoute").value === "default_public_interface_only", null, { timeout: 30000 }).catch(() => {}); }
const fixed = await g.sw.evaluate(() => chrome.privacy.network.webRTCIPHandlingPolicy.get({}));
await g.sw.evaluate(() => chrome.privacy.network.webRTCIPHandlingPolicy.clear({}));
ok("the thing to do beside the WebRTC answer does it: Chrome's route is narrowed, and the switch below shows it", !fix || (fixed.value === "default_public_interface_only" && fixed.levelOfControl === "controlled_by_this_extension"), fixed);
await e.click('#spaces .tab:has-text("Work")'); await e.waitForSelector(".card");
await e.click("#extrasBtn"); await e.waitForSelector("#extrasBody .extra");
ok("their switches read On", (await e.$$eval("#extrasBody .extra .btn", (x) => x.map((b) => b.textContent))).join() === "On,On,On,On");
ok("no page errors with the extras on", g.errs.length === 0, g.errs);
await g.ctx.close();

// ---------- nothing bookmarked, and a computer that can't say where it is ----------
// In this browser a location request that has failed once takes ten seconds to fail again, so
// each wait on one allows thirty.
// It says it is a Mac, where the switch for Chrome's location is in System Settings.
const n = await launch({ locate: false, timezoneId: "America/Los_Angeles", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36" });
const local = (key) => n.sw.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key);
// Waits for the saved place to pass a test. (waitForFunction can't: it takes a promise for a yes.)
const placed = async (pass, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) if (pass((await local("place")) || {})) return true; return false; };
const f = await n.open();
await f.waitForFunction(() => /network's city/.test(document.getElementById("toast").textContent), null, { timeout: 30000 }).catch(() => {});
await f.waitForSelector("#empty:not([hidden])");
ok("with nothing on the bookmarks bar the links area says so and offers three ways to bring links in, under the same strip as ever and beside Up next and Notes; there is no separate guide", (await f.isVisible("#empty")) && (await text(f, "#emptyTitle")) === "Bring in your links" && (await f.$$eval("#emptyWays .extra b", (x) => x.map((b) => b.textContent))).join() === "A starter set,A bookmarks file,Have an assistant write the file" && (await f.isVisible(".glance")) && (await f.isVisible("#nextPanel")) && !!(await f.$("#today[hidden]")) && (await f.$$eval("#spaces .tab", (x) => x.map((b) => b.textContent))).join() === "🔖 Your links,+ New space" && !(await f.isVisible("#edit")) && !(await f.$("#start")) && (await f.$$eval("#pages .tab", (x) => x.length)) === 3);
ok("when the computer won't say where it is, the first new tab uses the network's city, rounded, and says so", (await local("place")).source === "network" && (await local("place")).name === "San Francisco, California" && (await local("place")).lat === 37.77 && (await local("place")).lon === -122.42 && /^The sky and forecast are for your network's city: San Francisco, California\./.test(await text(f, "#toast")) && n.net.estimates === 1, { place: await local("place"), toast: await text(f, "#toast") });
await f.click('#pages .tab:has-text("Today")');
await f.waitForFunction(() => /approximate/.test(document.getElementById("place").textContent) && document.querySelector(".wx-temp"), null, { timeout: 8000 }).catch(() => {});
ok("Today marks the place approximate and the forecast is for it", (await text(f, "#place")) === "San Francisco, California (approximate)" && n.net.points.join() === "37.77,-122.42" && /Estimated from your network/.test(await f.getAttribute("#placeBtn", "title")), [await text(f, "#place"), n.net.points]);
await f.click("#toast button"); await f.waitForSelector("#todayAsk:not([hidden])");
ok("Change on that notice opens the place form, which says it is an estimate and why", /is an estimate from your network\. .*(couldn't work out|isn't allowed|took too long)/.test(await text(f, "#todayAskWhy")), await text(f, "#todayAskWhy"));
await f.click('#todayAskForm button:has-text("Use this computer")');
await f.waitForFunction(() => /instead/.test(document.getElementById("toast").textContent), null, { timeout: 30000 }).catch(() => {});
ok("pressing the button says why the exact spot was refused and what it used instead", /(couldn't work out|isn't allowed|took too long).* So this is your network's city instead: San Francisco, California\.$/.test(await text(f, "#toast")), await text(f, "#toast"));
// bringing links in: an assistant's prompt, a bookmarks file, a starter set
await f.click('#spaces .tab:has-text("Your links")'); await f.waitForSelector("#empty:not([hidden])");
await f.click('#emptyWays button:has-text("Copy the prompt")'); await f.waitForFunction(() => document.querySelector("#emptyWays .setup-then").textContent.length > 10);
ok("the assistant's prompt is copied (or shown to copy), with where to paste it; it asks before it invents an address", /^(Copied\. Paste it into|Copy it from the box below, and paste it into) Gemini, Claude or ChatGPT, then choose the file it gives you here\.$/.test(await text(f, "#emptyWays .setup-then")) && (await f.$$eval("#emptyWays .setup-then a", (x) => x.map((a) => new URL(a.href).hostname))).join() === "gemini.google.com,claude.ai,chatgpt.com" && (await f.evaluate(async () => { const { PROMPT } = await import("./setup.js"); return /Never guess or invent one/.test(PROMPT) && /NETSCAPE-Bookmark-file-1/.test(PROMPT) && /Choose a file/.test(PROMPT); })), await text(f, "#emptyWays .setup-then"));
const FILE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><H3>💼 Work</H3>
        <DL><p>
            <DT><A HREF="https://mail.example.com/">Mail</A>
            <DT><H3>Docs</H3>
            <DL><p>
                <DT><A HREF="https://wiki.example.com/">Wiki</A>
                <DT><A HREF="javascript:alert(1)">Bookmarklet</A>
                <DT><A HREF="chrome://settings/">Chrome page</A>
            </DL><p>
        </DL><p>
        <DT><H3>🏡 Home</H3>
        <DL><p>
            <DT><A HREF="https://bank.example.com/">Bank</A>
        </DL><p>
        <DT><A HREF="https://loose.example.com/">Loose</A>
    </DL><p>
    <DT><A HREF="https://other.example.com/">Not on the bar</A>
</DL><p>`;
const bring = async (text, name = "bookmarks.html") => { await f.setInputFiles("#emptyWays .setup-file", { name, mimeType: "text/html", buffer: Buffer.from(text) }); await f.waitForFunction((n) => !document.getElementById("toast").hidden && /Added|Nothing new|No web links/.test(document.getElementById("toast").textContent), name, { timeout: 8000 }).catch(() => {}); return text ? f.textContent("#toast") : ""; };
const shape = async () => { const walk = (n) => (n.url ? n.title : `${n.title}[${(n.children || []).map(walk).join(",")}]`); return (await n.tree()).children[0].children.map(walk).join(" "); };
const said1 = await bring(FILE);
await f.waitForSelector(".card");
ok("a bookmarks file's folders become spaces and collections; only web links are taken, loose ones are gathered, and the page opens on the first space", (await shape()) === "💼 Work[Mail,Docs[Wiki]] 🏡 Home[Bank] 📥 Imported[Loose]" && said1 === "Added 4 links in 4 new folders.Undo" && (await f.getAttribute('#spaces .tab:has-text("Work")', "aria-selected")) === "true" && !(await f.isVisible("#empty")), [await shape(), said1]);
await f.click("#extrasBtn"); await f.setInputFiles("#setupBody .setup-file", { name: "bookmarks.html", mimeType: "text/html", buffer: Buffer.from(FILE) });
await f.waitForFunction(() => /Nothing new/.test(document.getElementById("toast").textContent), null, { timeout: 8000 }).catch(() => {});
const said2 = await text(f, "#toast");
await f.setInputFiles("#setupBody .setup-file", { name: "notes.html", mimeType: "text/html", buffer: Buffer.from("<p>hello</p>") });
await f.waitForFunction(() => /No web links/.test(document.getElementById("toast").textContent), null, { timeout: 8000 }).catch(() => {});
ok("the same file again adds nothing, from Settings too, and a file with no links says so", said2 === "Nothing new to add. 4 links were already here." && (await shape()) === "💼 Work[Mail,Docs[Wiki]] 🏡 Home[Bank] 📥 Imported[Loose]" && (await text(f, "#toast")) === "No web links were found in notes.html. It should be a bookmarks file, as browsers export them.", [said2, await text(f, "#toast")]);
await f.keyboard.press("Escape");
await n.sw.evaluate(async () => { const [root] = await chrome.bookmarks.getTree(); for (const k of root.children[0].children) await chrome.bookmarks.removeTree(k.id); });
await f.waitForSelector("#empty:not([hidden])");
await f.click('#emptyWays button:has-text("Add the starter set")'); await f.waitForSelector(".card");

const starter = await shape();
await f.waitForFunction(() => /^Added/.test(document.getElementById("toast").textContent));
const said3 = await text(f, "#toast");
await f.click("#toast button"); await f.waitForSelector("#empty:not([hidden])");
ok("the starter set is one space of everyday places, opened at once, and Undo takes all of it away again", starter === "🏠 Home[Everyday[Gmail,Calendar,Drive,YouTube],Ask[Claude,ChatGPT,Gemini],Look up[Wikipedia,Translate,Maps]]" && said3 === "Added 10 links in 4 new folders.Undo" && (await shape()) === "", [starter, said3, await shape()]);
await f.click("#spaces .add-space"); await f.waitForSelector("#spaces .rename"); await f.waitForSelector(".emoji-pick"); await f.fill("#spaces .rename", "Home");
const picks = (await f.$$(".emoji-pick button")).length;
await f.click('.emoji-pick button:has-text("🏠")');
const withEmoji = { value: await f.inputValue("#spaces .rename"), focus: await f.evaluate(() => document.activeElement.className) };
await f.click('.emoji-pick button:has-text("⭐")'); const swapped = await f.inputValue("#spaces .rename"); await f.click('.emoji-pick button:has-text("🏠")');
await f.keyboard.press("Enter"); await f.waitForSelector('#spaces .tab[aria-selected="true"]:has-text("Home")');
ok("naming a folder offers a row of emoji: one press leads the name with it, or swaps the one that was there, and typing carries on", picks === 32 && withEmoji.value === "🏠 Home" && withEmoji.focus === "rename" && swapped === "⭐ Home" && !(await f.$(".emoji-pick")), withEmoji);
ok("the first space is made from the page, opens, and leaves Edit on to fill it", (await n.tree()).children[0].children.map((c) => c.title).join() === "🏠 Home" && (await f.evaluate(() => document.body.classList.contains("editing"))) && !(await f.isVisible("#empty")) && (await f.isVisible(".tile.add")));
await f.close();

// on a VPN the network is somewhere else: its city is not used, and the page says why and asks
n.net.estimateAs = { latitude: 59.3293, longitude: 18.0686, city: "Stockholm", principalSubdivision: "Stockholm", countryCode: "SE", countryName: "Sweden", zone: "Europe/Stockholm" };
await n.sw.evaluate(() => chrome.storage.local.remove(["place", "placeTried", "wx"]));
const fv = await n.open(); await fv.waitForSelector(".card");
await fv.waitForFunction(() => /type a place/.test(document.querySelector("#askForm .note").textContent), null, { timeout: 30000 }).catch(() => {});
ok("a network in another time zone (a VPN) is not taken for where you are: the page says so and asks", !(await local("place")) && !(await fv.$("#ask[hidden]")) && n.net.points.length === 1 && / Its network looks like it is in Stockholm, Sweden, which isn't this computer's time zone \(a VPN does that\), so type a place\. Open Location Services$/.test(await text(fv, "#askForm .note")) && (await fv.getAttribute("#askForm .note a", "href")) === "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices", await text(fv, "#askForm .note"));
await fv.fill("#askForm input", "94103"); await fv.press("#askForm input", "Enter"); await fv.waitForSelector("#askForm .place-hits button"); await fv.click("#askForm .place-hits button");
await fv.waitForFunction(() => /^\d+°$/.test(document.getElementById("glTemp").textContent), null, { timeout: 8000 }).catch(() => {});
n.net.estimateAs = null;
await n.sw.evaluate(async () => { const { place } = await chrome.storage.local.get("place"); await chrome.storage.local.set({ place: { ...place, at: Date.now() - 7 * 3600e3 } }); });
const asked1 = n.net.estimates;
const fw = await n.open(); await fw.waitForSelector(".card"); await fw.waitForTimeout(1500);
ok("a place typed on a VPN stays put: hours later nothing asks the computer or the network again", (await local("place")).source === "typed" && (await local("place")).name === "San Francisco, California" && n.net.estimates === asked1);
await fv.close(); await fw.close();

// travelling: the computer's time zone is the sign. A typed place asks; a followed one looks again at once
const zoned = (changes) => n.sw.evaluate(async (c) => { const { place } = await chrome.storage.local.get("place"); await chrome.storage.local.set({ place: { ...place, ...c } }); }, changes);
const toastOf = async (q) => ((await q.$("#toast[hidden]")) ? "" : text(q, "#toast"));
ok("every place is saved with the time zone it was set in", (await local("place")).zone === "America/Los_Angeles");
await zoned({ zone: "America/New_York" });
let ft = await n.open(); await ft.waitForSelector(".card"); await ft.waitForSelector("#toast:not([hidden])", { timeout: 5000 }).catch(() => {});
ok("a typed place whose computer has changed time zone is kept, and the page asks whether to change it", /^This computer's clock has changed time zone since you set San Francisco, California\. The sky and forecast are still for San Francisco, California\.ChangeKeep$/.test(await toastOf(ft)) && (await local("place")).source === "typed" && (await local("place")).lat === 37.77 && n.net.estimates === asked1, await toastOf(ft));
await ft.close(); ft = await n.open(); await ft.waitForSelector(".card"); await ft.waitForTimeout(800);
ok("it asks once, not on every new tab", (await toastOf(ft)) === "");
await zoned({ asked: undefined });
await ft.close(); ft = await n.open(); await ft.waitForSelector("#toast:not([hidden])");
await ft.click('#toast button:has-text("Keep")'); await placed((pl) => pl.zone === "America/Los_Angeles");
await ft.close(); ft = await n.open(); await ft.waitForSelector(".card"); await ft.waitForTimeout(800);
ok("Keep settles it: the place counts as set where the computer is now", (await toastOf(ft)) === "" && (await local("place")).name === "San Francisco, California" && !(await local("place")).asked);
await zoned({ zone: "America/New_York" });
await ft.close(); ft = await n.open(); await ft.waitForSelector("#toast:not([hidden])");
await ft.click('#toast button:has-text("Change")'); await ft.waitForSelector("#todayAsk:not([hidden])");
ok("Change opens the place form on Today", (await ft.getAttribute('#pages .tab:has-text("Today")', "aria-selected")) === "true");
await ft.close();
await n.sw.evaluate(() => chrome.storage.local.set({ place: { lat: 40.71, lon: -74.01, name: "New York, New York", source: "network", why: "It was off.", zone: "America/New_York", at: Date.now() - 3600e3 } }));
ft = await n.open(); await ft.waitForSelector(".card");
await placed((pl) => pl.zone === "America/Los_Angeles");
ok("a followed place is looked for again at once when the time zone changes, not six hours later", (await local("place")).source === "network" && (await local("place")).name === "San Francisco, California" && n.net.estimates === asked1 + 1 && n.net.points.at(-1) === "37.77,-122.42", await local("place"));
await ft.close();
await n.sw.evaluate(() => chrome.storage.local.set({ place: { lat: 40.71, lon: -74.01, source: "device", zone: "America/New_York", at: Date.now() - 3600e3 } }));
ft = await n.open(); await ft.waitForSelector(".card");
await placed((pl) => pl.source === "network");
ok("an exact place in a time zone the computer has left gives way to the network's city when the computer can't say", (await local("place")).source === "network" && (await local("place")).zone === "America/Los_Angeles" && (await local("place")).lat === 37.77);
await ft.close();

// the estimate unreachable too: nothing is assumed, and the page asks
n.net.estimateDown = true;
await n.sw.evaluate(() => chrome.storage.local.remove(["place", "placeTried", "wx"]));
const f1 = await n.open(); await f1.waitForSelector(".card");
await f1.waitForFunction(() => /type a place/.test(document.querySelector("#askForm .note").textContent), null, { timeout: 30000 }).catch(() => {});
ok("with no location and no estimate it says why, asks, and looks nothing up", !(await f1.$("#ask[hidden]")) && !!(await f1.$("#glSun[hidden]")) && /(couldn't work out|isn't allowed|took too long).* Its network couldn't be placed either, so type a place\. Open Location Services$/.test(await text(f1, "#askForm .note")) && /\d/.test(await text(f1, "#glTime")), await text(f1, "#askForm .note"));
await f1.close();
const f2 = await n.open(); await f2.waitForSelector(".card"); await f2.waitForTimeout(1200);
ok("it asks the computer once, not on every new tab", (await text(f2, "#askForm .note")) === "" && !(await f2.$("#ask[hidden]")));
await f2.fill("#askForm input", "94103"); await f2.press("#askForm input", "Enter"); await f2.waitForSelector("#askForm .place-hits button");
await f2.click("#askForm .place-hits button");
await f2.waitForFunction(() => /^\d+°$/.test(document.getElementById("glTemp").textContent), null, { timeout: 8000 }).catch(() => {});
ok("typing a place there and pressing Enter sets it, and the strip fills in", (await local("place")).name === "San Francisco, California" && (await local("place")).source === "typed" && !!(await f2.$("#ask[hidden]")) && /^\d+°$/.test(await text(f2, "#glTemp")) && n.net.points.at(-1) === "37.77,-122.41");
await f2.close();

// six hours on: an exact place is never swapped for a guess, and a guess becomes exact when it can
const aged = (place) => n.sw.evaluate((p) => chrome.storage.local.set({ place: { ...p, at: Date.now() - 7 * 3600e3 } }), place);
n.net.estimateDown = false;
const asked0 = n.net.estimates;
await aged({ lat: 40.71, lon: -74.01, source: "device" });
let f3 = await n.open(); await f3.waitForSelector(".card");
await placed((pl) => !!pl.tried);
ok("an exact place the computer can't confirm later is kept, the network is not asked, and it waits six hours to look again", (await local("place")).source === "device" && (await local("place")).lat === 40.71 && n.net.estimates === asked0 && Date.now() - (await local("place")).tried < 60e3, { place: await local("place"), asked: n.net.estimates - asked0 });
await f3.close();
await n.ctx.grantPermissions(["geolocation"]); await n.ctx.setGeolocation({ latitude: 40.7128, longitude: -74.006 });
await aged({ lat: 37.77, lon: -122.42, name: "San Francisco, California", source: "network", why: "It was off." });
f3 = await n.open(); await f3.waitForSelector(".card");
await placed((pl) => pl.source === "device");
ok("an estimate becomes the exact place by itself once the computer will say where it is", (await local("place")).source === "device" && (await local("place")).lat === 40.71 && !(await local("place")).name && n.net.estimates === asked0, await local("place"));
await f3.close();

// ---------- more spaces than the bar has room for ----------
await n.sw.evaluate(async () => { for (const t of ["🧪 Lab", "🎓 Courses", "🛒 Shopping", "✈️ Travel", "📚 Reading", "🎵 Music", "Plain name", "🧾 Taxes", "🏋️ Training", "🧑‍🍳 Recipes", "🗞️ News", "🏛️ Governance", "🧰 Platform"]) await chrome.bookmarks.create({ parentId: "1", title: t }); });
const wide = await n.open(); await wide.waitForSelector(".card"); await wide.waitForTimeout(500);
const topBar = (q) => q.evaluate(() => {
  const s = document.getElementById("spaces"), box = (e) => e.getBoundingClientRect();
  const on = s.querySelector('[aria-selected="true"]'), plus = s.querySelector(".add-space");
  return { rows: Math.round(box(document.querySelector(".bar")).height), scrolls: s.scrollWidth > s.clientWidth + 1, faded: s.className.replace("tabs", "").trim(), tight: s.querySelectorAll(".tab.tight").length, pencilIn: box(document.getElementById("edit")).right <= innerWidth, pagesIn: box(document.getElementById("pages")).left >= box(s).right - 1, onIn: !!on && box(on).left >= box(s).left - 1 && box(on).right <= box(s).right + 1, on: on && on.textContent, clear: !plus || !on || getComputedStyle(plus).display === "none" || box(on).right <= box(plus).left + 1, plusIn: !!plus && box(plus).right <= box(s).right + 1 && box(plus).left >= box(s).left };
});
let b1 = await topBar(wide);
ok("fourteen spaces stay on one row: the ones that don't fit narrow to their emoji, and Today, Shortcuts, Tools and the pencil keep their place", b1.rows < 64 && b1.tight >= 8 && b1.pencilIn && b1.pagesIn && b1.onIn && (await wide.getAttribute('#spaces .tab:has-text("Travel")', "title")) === "✈️ Travel", b1);
await wide.setViewportSize({ width: 700, height: 800 }); await wide.waitForTimeout(300);
await wide.click('#spaces .tab:has-text("Platform")', { force: true }).catch(() => {}); await wide.waitForTimeout(500);
b1 = await topBar(wide);
ok("in a narrow window the strip scrolls instead, fades where more is hidden, and brings the space you are in into view", b1.rows < 64 && b1.scrolls && b1.faded.includes("more-left") && b1.on === "🧰 Platform" && b1.onIn && b1.pencilIn && b1.pagesIn && (await wide.$eval("#pages .tab .l", (e) => getComputedStyle(e).display)) === "none", b1);
await wide.click("#edit"); await wide.waitForTimeout(400);
b1 = await topBar(wide);
ok("in Edit the + stays in reach at the end of the strip without covering the tab you are in", b1.plusIn && b1.clear && b1.onIn, b1);
await wide.close();
ok("no page errors without a location", n.errs.length === 0, n.errs);
await n.ctx.close();

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
