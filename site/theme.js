// Light/dark toggle shared by every page. The saved choice is applied before
// first paint by a one-line script in each page's <head>.
(function () {
  var root = document.documentElement, btn = document.querySelector(".theme-toggle");
  if (!btn) return;
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  function isDark() { return root.dataset.theme ? root.dataset.theme === "dark" : mq.matches; }
  function sync() { btn.setAttribute("aria-label", isDark() ? "Switch to light mode" : "Switch to dark mode"); }
  btn.addEventListener("click", function () {
    var next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
    sync();
  });
  mq.addEventListener("change", sync);
  sync();
})();
