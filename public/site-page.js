(function () {
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  var nodes = document.querySelectorAll('[data-reveal]');
  if (nodes.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    nodes.forEach(function (n) {
      io.observe(n);
    });
  } else if (nodes.length) {
    nodes.forEach(function (n) {
      n.classList.add('is-visible');
    });
  }

  var cta = document.getElementById('sticky-cta');
  if (cta) {
    var lastScroll = 0;
    window.addEventListener('scroll', function () {
      var scrollY = window.scrollY;
      if (scrollY > 500 && scrollY > lastScroll) cta.classList.add('translate-y-0');
      else if (scrollY < 200) cta.classList.remove('translate-y-0');
      lastScroll = scrollY;
    });
  }
})();
