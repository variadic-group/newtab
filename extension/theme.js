// Runs before the page first paints, so a tab opened at night is dark from its first frame.
// If you chose always light or always dark in Settings, that is that. Otherwise the page is
// dark when the system asks for dark, or when it is night where you are; today.js works out
// tonight's dusk and dawn and leaves them here for the next tab.
(function () {
  var dark = matchMedia("(prefers-color-scheme: dark)").matches;
  try {
    var accent = localStorage.getItem("accent");
    if (accent) document.documentElement.dataset.accent = accent;
    var pick = localStorage.getItem("theme");
    if (pick === "light" || pick === "dark") { document.documentElement.dataset.theme = pick; return; }
    var night = JSON.parse(localStorage.getItem("night") || "null");
    if (night && Date.now() >= night.from && Date.now() < night.to) dark = true;
  } catch (err) {
    // An unreadable saved night only means the page follows the system until today.js runs.
    console.warn("theme:", err.message);
  }
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
