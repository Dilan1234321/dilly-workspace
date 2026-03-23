(function () {
  var btn = document.getElementById("navMenuToggle");
  var panel = document.getElementById("navMenuPanel");
  if (!btn || !panel) return;
  var tailwindNav =
    panel.classList.contains("hidden") && panel.classList.contains("md:flex");
  btn.addEventListener("click", function () {
    var open = panel.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "Close" : "Menu";
    if (tailwindNav) {
      panel.classList.toggle("hidden", !open);
    }
  });
})();
