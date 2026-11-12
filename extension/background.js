import { resolve, addToNext } from "./shared.js";

// The search engines Chrome may hand typed words to.
const SEARCH = /^(www\.)?(google\.[a-z.]{2,6}|bing\.com|duckduckgo\.com|search\.brave\.com|ecosia\.org|startpage\.com|kagi\.com|search\.yahoo\.com)$/;

// What was typed, if this navigation is a short link: [name, words, whether the words are plain].
// "mail/" or "claude/what-to-ask" is a visit to the one-word host http://mail/. With a space in
// it ("claude/what should I ask") Chrome searches for it instead, so that search is read too.
function shortLink(u) {
  if (!/^https?:$/.test(u.protocol)) return null;
  if (!u.port && !u.hostname.includes(".") && u.hostname !== "localhost") return [u.hostname, u.pathname.slice(1), false];
  if (!SEARCH.test(u.hostname)) return null;
  const m = /^([a-z0-9]+)\/(.*)$/is.exec((u.searchParams.get("q") ?? u.searchParams.get("p") ?? "").trim());
  return m ? [m[1], m[2], true] : null;
}

// Catch it before the page loads and send the tab to the bookmark or service it names.
chrome.webNavigation.onBeforeNavigate.addListener(async (d) => {
  // Only the tab's own page, and not one Chrome is loading ahead of time while you type.
  if (d.frameId !== 0 || (d.documentLifecycle && d.documentLifecycle !== "active")) return;
  if (!URL.canParse(d.url)) return;
  const typed = shortLink(new URL(d.url));
  if (!typed) return;
  const target = await resolve(...typed);
  if (typeof target === "string") chrome.tabs.update(d.tabId, { url: target });
  // Words for a link with no search of its own go to whichever search engine Chrome is set to.
  else if (target) chrome.search.query({ text: target.search, tabId: d.tabId });
});

// "claude" then Space or Tab in the address bar takes a question with spaces in it.
chrome.omnibox.setDefaultSuggestion({ description: "Ask Claude: %s" });
chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  const url = "https://claude.ai/new?q=" + encodeURIComponent(text.trim());
  if (disposition === "currentTab") chrome.tabs.update({ url });
  else chrome.tabs.create({ url, active: disposition === "newForegroundTab" });
});

// The toolbar button (or its keyboard shortcut) files the page you're on under Up next, without
// opening a new tab.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !/^https?:/.test(tab.url || "")) return;
  await addToNext(tab);
  await chrome.action.setBadgeText({ tabId: tab.id, text: "✓" });
  setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }), 1500);
});
