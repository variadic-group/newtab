// Getting your links in when the bookmarks bar is bare, or any time after: a starter set, a
// bookmarks file from another browser, or a file an assistant writes after asking what you use.
// All three end the same way, as ordinary folders and bookmarks on the bookmarks bar.
import { el } from "./dom.js";
import { bookmarkBars } from "./shared.js";

const link = (title, url) => ({ title, url });
const STARTER = [{
  title: "🏠 Home",
  children: [
    { title: "Everyday", children: [link("Gmail", "https://mail.google.com/"), link("Calendar", "https://calendar.google.com/"), link("Drive", "https://drive.google.com/"), link("YouTube", "https://www.youtube.com/")] },
    { title: "Ask", children: [link("Claude", "https://claude.ai/new"), link("ChatGPT", "https://chatgpt.com/"), link("Gemini", "https://gemini.google.com/app")] },
    { title: "Look up", children: [link("Wikipedia", "https://en.wikipedia.org/"), link("Translate", "https://translate.google.com/"), link("Maps", "https://www.google.com/maps")] },
  ],
}];

export const PROMPT = `Help me set up my browser's start page. Interview me, then write a bookmarks file.

Ask me a few questions at a time:
1. What I do, and the three to six areas my browsing falls into (for example Work, Money, Home, Learning). Each area becomes a top-level folder.
2. For each area, the sites and tools I open most. Ask me for the real address whenever you are not certain of it. Never guess or invent one.
3. Which of those belong together (for example Banking and Taxes inside Money). Each group becomes a folder inside its area.

Then write one file called bookmarks.html in the Netscape bookmark format that browsers import:
- It starts with <!DOCTYPE NETSCAPE-Bookmark-file-1>, then <TITLE>Bookmarks</TITLE>, <H1>Bookmarks</H1> and one <DL><p> ... </DL><p> around everything.
- A folder is <DT><H3>Name</H3> followed by its own <DL><p> ... </DL><p>. A link is <DT><A HREF="https://...">Name</A>.
- Three levels at most: area, group, link. Three to six areas, and about eight links in a group at most.
- Begin each area's name with one emoji (for example "💼 Work"). Keep link names to one or two words.
- Use only https addresses I gave you or that you are sure of. Leave out anything you are unsure of, and list those for me afterwards.

Give me the file to download, or its full text in one code block that I can save as bookmarks.html. Then tell me the next three things to do:
1. Open a new tab, and under "Bring in your links" press "Choose a file" and pick bookmarks.html. (It is on the Start tab, and in Settings at the top right.)
2. Type a link's short name in the address bar and press Enter to open it. The short name is usually the first word of the link's name in lower case, followed by a slash: a link called "Stripe" opens with stripe/. Words after the slash search that site. The Shortcuts tab lists every name.
3. Pin the extension's button in the browser toolbar. One press saves the page I am on to a list called Up next.
List the short names you expect for the five links I said I use most.`;

const MAX_LINKS = 2000;
const count = (nodes) => nodes.reduce((n, x) => n + (x.url ? 1 : count(x.children)), 0);

// Reads the bookmark file format every browser exports: nested lists, a heading for a folder, a
// link for a bookmark. Only web addresses are kept, so a script saved as a bookmark never is.
export function parseBookmarks(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walk = (dl) => {
    const out = [];
    for (const dt of dl.querySelectorAll(":scope > dt")) {
      const h = dt.querySelector(":scope > h3"), a = dt.querySelector(":scope > a");
      if (h) {
        const next = dt.nextElementSibling;
        const inner = dt.querySelector(":scope > dl") || (next && next.tagName === "DL" ? next : null);
        out.push({ title: h.textContent.trim() || "Untitled", bar: h.hasAttribute("personal_toolbar_folder"), children: inner ? walk(inner) : [] });
      } else if (a) {
        let url;
        try { url = new URL(a.getAttribute("href")); } catch { continue; } // not an address: left out
        if (/^https?:$/.test(url.protocol)) out.push({ title: a.textContent.trim() || url.hostname, url: url.href });
      }
    }
    return out;
  };
  const top = doc.querySelector("dl");
  if (!top) return [];
  const all = walk(top);
  // A browser's own export wraps the bar in a folder; what is on the bar is what belongs here.
  const bar = all.find((n) => n.bar);
  return bar ? bar.children : all;
}

// Puts a tree of folders and links on the bookmarks bar. A folder that is already there by the
// same name is added to, and a link already in it is left alone, so doing this twice adds nothing.
export async function plant(tree) {
  const [root] = await chrome.bookmarks.getTree();
  const bar = bookmarkBars(root)[0];
  const made = [];
  const tally = { links: 0, folders: 0, already: 0 };
  const into = async (parentId, nodes, fresh) => {
    const kids = fresh ? [] : await chrome.bookmarks.getChildren(parentId);
    for (const n of nodes) {
      if (n.url) {
        if (kids.some((k) => k.url === n.url)) { tally.already++; continue; }
        const b = await chrome.bookmarks.create({ parentId, title: n.title, url: n.url });
        tally.links++;
        if (!fresh) made.push(b.id);
      } else {
        const have = kids.find((k) => !k.url && k.title === n.title);
        const f = have || (await chrome.bookmarks.create({ parentId, title: n.title }));
        if (!have) { tally.folders++; if (!fresh) made.push(f.id); }
        await into(f.id, n.children, fresh || !have);
      }
    }
  };
  const loose = tree.filter((n) => n.url);
  await into(bar.id, [...tree.filter((n) => !n.url), ...(loose.length ? [{ title: "📥 Imported", children: loose }] : [])], false);
  const undo = async () => {
    for (const id of made.reverse()) await chrome.bookmarks.removeTree(id).catch((err) => console.warn("undo:", err.message));
  };
  return { ...tally, undo };
}

const many = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// `opened` is told when these are the first folders on the bar, so the page can open on them.
async function bring(tree, { toast, opened }, empty) {
  const links = count(tree);
  if (!links) return toast(empty);
  if (links > MAX_LINKS) return toast(`That file has ${links.toLocaleString()} links, more than this page is for. Chrome's bookmark manager can import it whole.`, null, { ms: 12000 });
  const [root] = await chrome.bookmarks.getTree();
  const first = !(await chrome.bookmarks.getChildren(bookmarkBars(root)[0].id)).some((k) => !k.url);
  const done = await plant(tree);
  if (first && done.folders) opened();
  const said = [done.links ? `Added ${many(done.links, "link")}${done.folders ? ` in ${many(done.folders, "new folder")}` : ""}.` : "Nothing new to add.", done.already ? `${many(done.already, "link")} ${done.already === 1 ? "was" : "were"} already here.` : ""].filter(Boolean).join(" ");
  toast(said, done.links || done.folders ? done.undo : null, { ms: 15000 });
}

// The three ways in, as rows: what it is, what it does, one button.
export function setupRows(page) {
  const { toast } = page;
  const row = (title, text, ...acts) => {
    const what = el("div");
    what.append(el("b", null, title), el("p", "cap", text));
    const does = el("div", "setup-acts");
    does.append(...acts);
    const r = el("div", "extra");
    r.append(what, does);
    return r;
  };
  const button = (label, run) => { const b = el("button", "btn", label); b.type = "button"; b.onclick = run; return b; };

  const file = el("input");
  file.type = "file";
  file.accept = ".html,.htm,text/html";
  file.hidden = true;
  file.className = "setup-file";
  file.onchange = async () => {
    const [chosen] = file.files;
    file.value = "";
    if (!chosen) return;
    try { await bring(parseBookmarks(await chosen.text()), page, `No web links were found in ${chosen.name}. It should be a bookmarks file, as browsers export them.`); }
    catch (err) { console.error("import", err); toast(`That file couldn't be brought in: ${err.message}.`, null, { ms: 12000 }); }
  };

  const copied = el("span", "cap setup-then");
  copied.setAttribute("role", "status");
  const copy = button("Copy the prompt", async () => {
    // A browser that won't write to the clipboard gets the prompt in a box to copy by hand.
    let lead = "Copied. Paste it into ";
    try { await navigator.clipboard.writeText(PROMPT); } catch (err) {
      console.warn("clipboard:", err.message);
      const box = el("textarea", "setup-prompt");
      box.readOnly = true;
      box.value = PROMPT;
      box.setAttribute("aria-label", "The prompt, to copy");
      copy.closest(".extra").after(box);
      box.select();
      lead = "Copy it from the box below, and paste it into ";
    }
    copied.replaceChildren(lead);
    [["Gemini", "https://gemini.google.com/app"], ["Claude", "https://claude.ai/new"], ["ChatGPT", "https://chatgpt.com/"]].forEach(([name, href], i, all) => {
      const a = el("a", null, name);
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener";
      copied.append(a, i < all.length - 2 ? ", " : i === all.length - 2 ? " or " : ", then choose the file it gives you here.");
    });
  });

  return [
    row("A starter set", "One space, Home, with everyday Google apps, three assistants and a few places to look things up. Rename or remove any of it afterwards.", button("Add the starter set", () => bring(STARTER, page, ""))),
    row("A bookmarks file", "Exported from another browser or profile, or written by an assistant. Its folders become spaces and collections. Only web links are taken, and nothing already here is added twice.", button("Choose a file", () => file.click()), file),
    row("Have an assistant write the file", "Copy a prompt into the assistant you use. It asks what you do and which sites you open, then hands you a bookmarks file to choose above. Nothing on this page talks to it.", copy, copied),
  ];
}
