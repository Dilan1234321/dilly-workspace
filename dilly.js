(function () {
  /* Scroll hero: second panel rises with scroll progress */
  const heroWrapper = document.querySelector(".hero-wrapper");
  const bg2 = document.querySelector(".bg-2");

  function updateHeroParallax() {
    if (!heroWrapper || !bg2) return;
    const rect = heroWrapper.getBoundingClientRect();
    const scrollable = heroWrapper.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return;
    const scrolled = Math.min(Math.max(-rect.top, 0), scrollable);
    const t = scrolled / scrollable;
    const y = 100 - t * 100;
    bg2.style.transform = "translateY(" + y + "%)";
  }

  window.addEventListener("scroll", updateHeroParallax, { passive: true });
  window.addEventListener("resize", updateHeroParallax);
  updateHeroParallax();

  /* Mobile nav */
  const menuToggle = document.querySelector(".menu-toggle");
  const navGlass = document.querySelector(".nav-glass");

  if (menuToggle && navGlass) {
    menuToggle.addEventListener("click", function () {
      const open = navGlass.classList.toggle("is-open");
      menuToggle.classList.toggle("is-open", open);
      menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    navGlass.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navGlass.classList.remove("is-open");
        menuToggle.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        navGlass.querySelectorAll(".nav-dropdown.is-open").forEach(function (d) {
          d.classList.remove("is-open");
          var b = d.querySelector(".nav-item--dropdown");
          if (b) b.setAttribute("aria-expanded", "false");
        });
      });
    });
  }

  /* Nav mega-dropdowns: mobile accordion */
  document.querySelectorAll(".nav-item--dropdown").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      if (!window.matchMedia("(max-width: 1023px)").matches) return;
      e.preventDefault();
      e.stopPropagation();
      var drop = btn.closest(".nav-dropdown");
      if (!drop) return;
      var open = !drop.classList.contains("is-open");
      document.querySelectorAll(".nav-dropdown").forEach(function (d) {
        d.classList.remove("is-open");
        var b = d.querySelector(".nav-item--dropdown");
        if (b) b.setAttribute("aria-expanded", "false");
      });
      if (open) {
        drop.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  /* Current nav from body data attributes */
  var feat = document.body.getAttribute("data-nav-feature");
  if (feat) {
    var flink = document.querySelector('.nav-dropdown-link[data-nav-feature="' + feat + '"]');
    if (flink) {
      flink.classList.add("nav-dropdown-link--current");
      flink.setAttribute("aria-current", "page");
    }
  }
  var page = document.body.getAttribute("data-nav-page");
  function markNavCurrent(selector) {
    var el = document.querySelector(selector);
    if (!el) return;
    el.setAttribute("aria-current", "page");
    if (el.classList.contains("nav-dropdown-link")) {
      el.classList.add("nav-dropdown-link--current");
    }
  }
  if (page === "pricing") {
    markNavCurrent('.nav-dropdown-link[href="pricing.html"], .nav-item[href="pricing.html"]');
  }
  if (page === "quiz") {
    markNavCurrent('.nav-dropdown-link[href="quiz.html"], .nav-item[href="quiz.html"]');
  }
  if (page === "signin") {
    markNavCurrent('.nav-item[href="signin.html"]');
  }
  if (page === "faq") {
    markNavCurrent('.nav-dropdown-link[href="faq.html"], .nav-item[href="faq.html"]');
  }

  /* Tabs */
  document.querySelectorAll("[data-tabs]").forEach(function (rootEl) {
    const buttons = rootEl.querySelectorAll(".tab-btn");
    const panels = rootEl.querySelectorAll(".tab-panel");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-tab");
        buttons.forEach(function (b) {
          const on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        panels.forEach(function (p) {
          p.classList.toggle("is-active", p.getAttribute("id") === id);
        });
      });
    });
  });

  /* FAQ accordion */
  document.querySelectorAll(".faq-item").forEach(function (item) {
    const trigger = item.querySelector(".faq-trigger");
    const panel = item.querySelector(".faq-panel");
    const inner = item.querySelector(".faq-panel-inner");
    if (!trigger || !panel || !inner) return;

    trigger.addEventListener("click", function () {
      const open = item.classList.toggle("is-open");
      if (open) {
        panel.style.maxHeight = inner.offsetHeight + "px";
      } else {
        panel.style.maxHeight = "0";
      }
    });
  });

  /* Quiz wizard */
  const quizRoot = document.querySelector("[data-quiz]");
  if (quizRoot) {
    const steps = quizRoot.querySelectorAll(".quiz-step");
    let stepIndex = 0;

    function showStep(i) {
      stepIndex = i;
      steps.forEach(function (s, j) {
        s.classList.toggle("is-active", j === i);
      });
    }

    quizRoot.querySelectorAll("[data-next]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const next = parseInt(btn.getAttribute("data-next"), 10);
        if (!isNaN(next)) showStep(next);
      });
    });

    quizRoot.querySelectorAll("[data-quiz-back]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const prev = parseInt(btn.getAttribute("data-quiz-back"), 10);
        if (!isNaN(prev)) showStep(prev);
      });
    });

    showStep(0);
  }

  /* Toolkit bento: staggered reveal when scrolled into view */
  var toolkitBento = document.querySelector("[data-toolkit-bento]");
  if (toolkitBento) {
    function revealToolkit() {
      toolkitBento.classList.add("is-visible");
    }
    if (!("IntersectionObserver" in window)) {
      revealToolkit();
    } else {
      var tkIo = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              revealToolkit();
              tkIo.disconnect();
            }
          });
        },
        { rootMargin: "0px 0px -6% 0px", threshold: 0.1 }
      );
      tkIo.observe(toolkitBento);
    }
  }
})();
