// Runs before the page first paints, so a tab opened at night is dark from its first frame.
// The page is dark when the system asks for dark, or when it is night where you are; today.js
// works out tonight's dusk and dawn and leaves them here for the next tab.
(function () {
  var dark = matchMedia("(prefers-color-scheme: dark)").matches;
  try {
    var night = JSON.parse(localStorage.getItem("night") || "null");
    if (night && Date.now() >= night.from && Date.now() < night.to) dark = true;
  } catch (err) {
    // An unreadable saved night only means the page follows the system until today.js runs.
    console.warn("theme:", err.message);
  }
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
