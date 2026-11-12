// What this extension itself keeps (short names, your own shortcuts, notes, cities, the look) as
// one file you can put away and bring back. Bookmarks are Chrome's and are not in it. A file is
// read as untrusted: only the things below, in the shape they should have, are taken from it.
const text = (v, max) => typeof v === "string" && v.length <= max;
const words = (o, max) => !!o && typeof o === "object" && !Array.isArray(o) && Object.entries(o).every(([k, v]) => text(k, 2000) && text(v, max));
const PAGE = /^note(:[a-z0-9]{1,16})?$/;
const SHAPES = {
  aliases: (v) => words(v, 60),
  links: (v) => words(v, 2000),
  theme: (v) => ["sun", "light", "dark"].includes(v),
  accent: (v) => ["teal", "blue", "violet", "rose"].includes(v),
  view: (v) => ["tiles", "list"].includes(v),
  guide: (v) => ["shown", "hidden"].includes(v),
  usedShort: (v) => v === true,
  zones: (v) => Array.isArray(v) && v.length <= 8 && v.every((z) => z && text(z.name, 200) && text(z.zone, 60) && Number.isFinite(z.lat) && Number.isFinite(z.lon)),
  notePages: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 8 && v.every((k) => typeof k === "string" && PAGE.test(k)),
};

export async function saveCopy() {
  const all = await chrome.storage.sync.get(null);
  const kept = Object.fromEntries(Object.entries(all).filter(([k, v]) => (SHAPES[k] ? SHAPES[k](v) : PAGE.test(k) && text(v, 8000))));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "new-tab", version: chrome.runtime.getManifest().version, saved: new Date().toISOString(), settings: kept }, null, 2)], { type: "application/json" }));
  a.download = `new-tab-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return Object.keys(kept).length;
}

// Returns how many things were restored. What the file doesn't mention is left as it is.
export async function restoreCopy(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error("it isn't a settings file from this page"); }
  if (!data || data.app !== "new-tab" || !data.settings || typeof data.settings !== "object") throw new Error("it isn't a settings file from this page");
  const good = Object.fromEntries(Object.entries(data.settings).filter(([k, v]) => (SHAPES[k] ? SHAPES[k](v) : PAGE.test(k) && text(v, 8000))));
  if (!Object.keys(good).length) throw new Error("there was nothing in it this page keeps");
  await chrome.storage.sync.set(good);
  return Object.keys(good).length;
}
