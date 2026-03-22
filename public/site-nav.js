(function () {
  var btn = document.getElementById("navMenuToggle");
  var panel = document.getElementById("navMenuPanel");
  if (!btn || !panel) return;
  btn.addEventListener("click", function () {
    var open = panel.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "Close" : "Menu";
  });
})();
