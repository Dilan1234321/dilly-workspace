(function () {
  var btn = document.getElementById("navMenuToggle");
  var panel = document.getElementById("navMenuPanel");
  if (!btn || !panel) return;

  function isMobileNav() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function setOpen(open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "Close" : "Menu";
    if (isMobileNav()) {
      panel.classList.toggle("hidden", !open);
      if (open) {
        panel.classList.add("flex", "flex-col");
      } else {
        panel.classList.remove("flex", "flex-col");
      }
    }
    document.body.style.overflow = open && isMobileNav() ? "hidden" : "";
    if (!open) {
      panel.classList.remove("is-open");
    }
  }

  btn.addEventListener("click", function () {
    var willOpen = panel.classList.contains("hidden");
    panel.classList.toggle("is-open", willOpen);
    setOpen(willOpen);
  });

  panel.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () {
      if (isMobileNav()) {
        setOpen(false);
      }
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isMobileNav() && !panel.classList.contains("hidden")) {
      setOpen(false);
    }
  });
})();
