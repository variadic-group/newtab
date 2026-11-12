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
await p.waitForFunction(() => /^\d+°$/.test(document.getElementById("glTemp").textContent) && !document.getElementById("glRadar").hidden, null, { timeout: 8000 }).catch(() => {});
ok("the first new tab asks the computer where it is, saves that rounded, and the forecast follows", (await place()).source === "device" && (await place()).lat === 40.71 && net.points.join() === "40.71,-74.01" && !!(await p.$("#ask[hidden]")), { place: await place(), lookups: net.points });

// ---------- layout, the glance, the footer ----------
ok("tabs: spaces, then Today and Shortcuts", true, [await p.$$eval("#spaces .tab", (x) => x.map((e) => e.textContent)), await p.$$eval("#pages .tab", (x) => x.map((e) => e.textContent))]);
ok("the glance shows the time, the sun and the weather now", /\d/.test(await text(p, "#glTime")) && /↑ \d/.test(await text(p, "#glRise")) && /↓ \d/.test(await text(p, "#glSet")) && / in \d/.test(await text(p, "#glLeft")) && /^\d+°$/.test(await text(p, "#glTemp")) && /High|Low/.test(await text(p, "#glHiLo")), { time: await text(p, "#glTime"), sun: await text(p, "#glLeft"), now: [await text(p, "#glTemp"), await text(p, "#glText"), await text(p, "#glHiLo")] });
ok("the glance has a radar still, not the loop", /_0\.gif/.test(await p.$eval("#glRadarImg", (i) => i.src)) && !(await p.$("#glRadar[hidden]")));
ok("the footer says how to type a short link and how to search with one, leads to them all, and holds Extras and the version", /mail\/.*claude\/.*short name.*mail\/invoice/.test(await text(p, "#hint")) && !!(await p.$("#hint #goShortcuts")) && (await p.$$eval(".foot nav .mini", (x) => x.map((e) => e.id))).join() === "extrasBtn,version" && (await text(p, "#version")) === "v" + manifest.version, await text(p, "#hint"));
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
ok("g/ is no longer a shortcut: plain words are what the address bar already searches", (await go("http://g/best-pizza")) === "http://g/best-pizza");
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
ok("a ZIP code works: this country's match comes first, named by its town", offered[0] === "94103 · San Francisco, California" && (await place()).lat === 37.77 && (await text(p, "#place")) === "San Francisco, California", offered);
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

// ---------- nothing bookmarked, and a computer that can't say where it is ----------
// In this browser a location request that has failed once takes ten seconds to fail again, so
// each wait on one allows thirty.
const n = await launch({ locate: false, timezoneId: "America/Los_Angeles" });
const local = (key) => n.sw.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key);
// Waits for the saved place to pass a test. (waitForFunction can't: it takes a promise for a yes.)
const placed = async (pass, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) if (pass((await local("place")) || {})) return true; return false; };
const f = await n.open();
await f.waitForFunction(() => /network's city/.test(document.getElementById("toast").textContent), null, { timeout: 30000 }).catch(() => {});
ok("with no folders on the bookmarks bar the page says so and offers a first space without Edit", (await f.isVisible("#empty")) && (await text(f, "#spaces .add-space")) === "+ New space" && (await f.isVisible("#spaces .add-space")) && !(await f.$("#today[hidden]")));
ok("when the computer won't say where it is, the first new tab uses the network's city, rounded, and says so", (await local("place")).source === "network" && (await local("place")).name === "San Francisco, California" && (await local("place")).lat === 37.77 && (await local("place")).lon === -122.42 && /^The sky and forecast are for your network's city: San Francisco, California\./.test(await text(f, "#toast")) && n.net.estimates === 1, { place: await local("place"), toast: await text(f, "#toast") });
await f.waitForFunction(() => /approximate/.test(document.getElementById("place").textContent) && document.querySelector(".wx-temp"), null, { timeout: 8000 }).catch(() => {});
ok("Today marks the place approximate and the forecast is for it", (await text(f, "#place")) === "San Francisco, California (approximate)" && n.net.points.join() === "37.77,-122.42" && /Estimated from your network/.test(await f.getAttribute("#placeBtn", "title")), [await text(f, "#place"), n.net.points]);
await f.click("#toast button"); await f.waitForSelector("#todayAsk:not([hidden])");
ok("Change on that notice opens the place form, which says it is an estimate and why", /is an estimate from your network\. .*(couldn't work out|isn't allowed|took too long)/.test(await text(f, "#todayAskWhy")), await text(f, "#todayAskWhy"));
await f.click('#todayAskForm button:has-text("Use this computer")');
await f.waitForFunction(() => /instead/.test(document.getElementById("toast").textContent), null, { timeout: 30000 }).catch(() => {});
ok("pressing the button says why the exact spot was refused and what it used instead", /(couldn't work out|isn't allowed|took too long).* So this is your network's city instead: San Francisco, California\.$/.test(await text(f, "#toast")), await text(f, "#toast"));
await f.click("#spaces .add-space"); await f.waitForSelector("#spaces .rename"); await f.fill("#spaces .rename", "🏠 Home"); await f.keyboard.press("Enter"); await f.waitForSelector('#spaces .tab[aria-selected="true"]:has-text("Home")');
ok("the first space is made from the page, opens, and leaves Edit on to fill it", (await n.tree()).children[0].children.map((c) => c.title).join() === "🏠 Home" && (await f.evaluate(() => document.body.classList.contains("editing"))) && !(await f.isVisible("#empty")) && (await f.isVisible(".tile.add")));
await f.close();

// on a VPN the network is somewhere else: its city is not used, and the page says why and asks
n.net.estimateAs = { latitude: 59.3293, longitude: 18.0686, city: "Stockholm", principalSubdivision: "Stockholm", countryCode: "SE", countryName: "Sweden", zone: "Europe/Stockholm" };
await n.sw.evaluate(() => chrome.storage.local.remove(["place", "placeTried", "wx"]));
const fv = await n.open(); await fv.waitForSelector(".card");
await fv.waitForFunction(() => /type a place/.test(document.querySelector("#askForm .note").textContent), null, { timeout: 30000 }).catch(() => {});
ok("a network in another time zone (a VPN) is not taken for where you are: the page says so and asks", !(await local("place")) && !(await fv.$("#ask[hidden]")) && n.net.points.length === 1 && / Its network looks like it is in Stockholm, Sweden, which isn't this computer's time zone \(a VPN does that\), so type a place\.$/.test(await text(fv, "#askForm .note")), await text(fv, "#askForm .note"));
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
ok("with no location and no estimate it says why, asks, and looks nothing up", !(await f1.$("#ask[hidden]")) && !!(await f1.$("#glSun[hidden]")) && /(couldn't work out|isn't allowed|took too long).* Its network couldn't be placed either, so type a place\.$/.test(await text(f1, "#askForm .note")) && /\d/.test(await text(f1, "#glTime")), await text(f1, "#askForm .note"));
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
ok("no page errors without a location", n.errs.length === 0, n.errs);
await n.ctx.close();

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
