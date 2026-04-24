// Dilly landing page — minimal JS

// ── Nav: add shadow on scroll ──────────────────────────────────────────────
(function () {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  const onScroll = () => {
    if (window.scrollY > 20) {
      nav.style.borderBottomColor = 'rgba(255,255,255,0.06)';
    } else {
      nav.style.borderBottomColor = '';
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
})();

// ── Intersection Observer fallback for scroll reveals ──────────────────────
// Used when CSS animation-timeline:view() is not supported (Firefox < 110, Safari < 17)
(function () {
  if (CSS.supports('animation-timeline', 'scroll()')) return; // native handles it

  const els = document.querySelectorAll('.reveal-fade');
  if (!els.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.transition = 'opacity 0.6s cubic-bezier(0.16,1,0.3,1)';
          entry.target.style.opacity = '1';
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
  );

  els.forEach((el) => {
    el.style.opacity = '0';
    observer.observe(el);
  });
})();
