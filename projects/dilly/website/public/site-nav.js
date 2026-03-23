(function () {
  var btn = document.getElementById("navMenuToggle");
  var panel = document.getElementById("navMenuPanel");
  if (!btn || !panel) return;
  var tailwindNav =
    panel.classList.contains("hidden") && panel.classList.contains("md:flex");

  function setOpen(open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "Close" : "Menu";
    if (tailwindNav) {
      panel.classList.toggle("hidden", !open);
    }
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) {
      panel.classList.remove("is-open");
    }
  }

  btn.addEventListener("click", function () {
    var willOpen = panel.classList.contains("hidden");
    panel.classList.toggle("is-open", willOpen);
    if (tailwindNav) {
      panel.classList.toggle("hidden", !willOpen);
    }
    setOpen(willOpen);
  });

  panel.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () {
      if (window.matchMedia("(max-width: 767px)").matches && tailwindNav) {
        setOpen(false);
      }
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && tailwindNav && !panel.classList.contains("hidden")) {
      setOpen(false);
    }
  });
})();
