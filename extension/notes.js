// Notes: a few pages of plain text that travel with your Chrome profile. Each page is one
// synced value, and Chrome caps a synced value at about 8 KB, so a save can be refused. The
// first page keeps the key the single note always had, so nothing written before is lost.
import { $, el } from "./dom.js";

const FIRST = "note";
const MAX_PAGES = 8;
const note = $("note");
let pages = [FIRST];
let texts = {};
let at = localStorage.getItem("notePage") || FIRST;
let timer;
let dirty = false;
let toast = () => {};

const state = (text) => { $("noteState").textContent = text; };
const titleOf = (key) => ((texts[key] || "").split("\n").find((l) => l.trim()) || "").trim().slice(0, 24) || `Page ${pages.indexOf(key) + 1}`;

function draw() {
  if (!dirty && document.activeElement !== note) note.value = texts[at] || "";
  const many = pages.length > 1;
  $("notePages").hidden = !many;
  $("notePages").replaceChildren(...pages.map((key) => {
    const b = el("button", "np", titleOf(key));
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(key === at));
    b.onclick = () => open(key);
    return b;
  }));
  $("noteNew").hidden = pages.length >= MAX_PAGES;
  $("noteDelete").textContent = many ? "Delete" : "Clear";
  $("noteDelete").title = many ? "Deletes this page of notes. It can be put back." : "Empties the note. It can be put back.";
}

export async function loadNotes() {
  const { notePages } = await chrome.storage.sync.get("notePages");
  pages = Array.isArray(notePages) && notePages.length ? notePages : [FIRST];
  texts = await chrome.storage.sync.get(pages);
  if (!pages.includes(at)) at = pages[0];
  draw();
}

async function save() {
  clearTimeout(timer);
  if (!dirty) return;
  dirty = false;
  texts[at] = note.value;
  try {
    await chrome.storage.sync.set({ [at]: note.value });
    state("saved");
  } catch (err) {
    console.error("note", err);
    state("too long to save: shorten it");
  }
  draw();
}

async function open(key) {
  await save();
  at = key;
  localStorage.setItem("notePage", key);
  note.value = texts[key] || "";
  state("");
  draw();
}

// The same note in a bigger box, for when it is more than a line or two.
export const bigNote = (on) => {
  note.closest(".notes").classList.toggle("big", on);
  $("noteBig").textContent = on ? "Shrink" : "Expand";
  $("noteBig").setAttribute("aria-pressed", String(on));
  if (on) note.focus();
};
export const noteIsBig = () => $("noteBig").getAttribute("aria-pressed") === "true";

export function wireNotes(say) {
  toast = say;
  note.oninput = () => {
    dirty = true;
    state("");
    clearTimeout(timer);
    timer = setTimeout(save, 1200);
  };
  note.onblur = save;
  addEventListener("pagehide", save);
  $("noteBig").onclick = () => bigNote(!noteIsBig());

  $("noteNew").onclick = async () => {
    await save();
    const key = `note:${Date.now().toString(36)}`;
    pages = [...pages, key];
    texts[key] = "";
    await chrome.storage.sync.set({ notePages: pages, [key]: "" });
    await open(key);
    note.focus();
  };
  $("noteCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(note.value); state("copied"); } catch (err) {
      console.warn("clipboard:", err.message);
      note.select();
      state("selected, ready to copy");
    }
  };
  // A page leaves the browser as a plain text file, named after its first line.
  $("noteSave").onclick = () => {
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([note.value], { type: "text/plain" }));
    a.download = `${titleOf(at).replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "note"}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  // Deleting the only page empties it. Either way it can be put back.
  $("noteDelete").onclick = async () => {
    clearTimeout(timer);
    dirty = false;
    const key = at, text = note.value, index = pages.indexOf(key), name = titleOf(key);
    if (pages.length === 1) {
      if (!text) return;
      await chrome.storage.sync.set({ [key]: "" });
      toast(`Cleared ${name}`, () => chrome.storage.sync.set({ [key]: text }));
      return;
    }
    const rest = pages.filter((k) => k !== key);
    at = rest[Math.min(index, rest.length - 1)];
    localStorage.setItem("notePage", at);
    await chrome.storage.sync.set({ notePages: rest });
    await chrome.storage.sync.remove(key);
    toast(`Deleted ${name}`, async () => {
      const { notePages = [FIRST] } = await chrome.storage.sync.get("notePages");
      const back = [...notePages];
      back.splice(index, 0, key);
      await chrome.storage.sync.set({ notePages: back, [key]: text });
    });
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && (changes.notePages || pages.some((k) => changes[k]))) loadNotes();
  });
}
