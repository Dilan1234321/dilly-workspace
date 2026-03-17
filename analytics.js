/* Meridian marketing site analytics - conversion funnel tracking.
 * Wire up gtag (GA4) or plausible() when you add your analytics provider. */
(function() {
  document.querySelectorAll('[data-cta]').forEach(function(el) {
    el.addEventListener('click', function() {
      var cta = el.getAttribute('data-cta');
      if (typeof gtag === 'function') gtag('event', 'cta_click', { cta: cta });
      if (typeof plausible === 'function') plausible('CTA Click', { props: { cta: cta } });
    });
  });
})();
