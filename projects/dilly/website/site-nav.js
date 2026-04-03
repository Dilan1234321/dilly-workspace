(function () {
  var HEADER_HTML =
    '<header class="site-header sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-xl">' +
    '<div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-5 md:px-8 md:py-4">' +
    '<a href="index.html" class="relative z-[120] flex min-w-0 shrink-0 items-center">' +
    '<img src="dilly-wordmark.png" alt="Dilly" class="site-header-logo shrink-0" width="612" height="408" decoding="async" />' +
    '</a>' +
    '' +
    '<div class="nav-menu-panel static z-auto flex max-h-none flex-1 flex-row justify-end overflow-visible border-0 bg-transparent p-0 shadow-none backdrop-blur-none" id="navMenuPanel">' +
    '<nav class="mx-0 flex max-w-none flex-row items-center gap-0 rounded-full bg-zinc-900/90 p-1.5 pl-3 ring-1 ring-white/10" aria-label="Main">' +
    '<a href="features.html" class="site-nav-link rounded-full px-3 py-2 text-sm font-medium text-zinc-300 hover:text-white">Features</a>' +
    '<a href="how-it-works.html" class="site-nav-link rounded-full px-3 py-2 text-sm font-medium text-zinc-300 hover:text-white">How it works</a>' +
    '<a href="tracks.html" class="site-nav-link rounded-full px-3 py-2 text-sm font-medium text-zinc-300 hover:text-white">Tracks</a>' +
    '<a href="pricing.html" class="site-nav-link rounded-full px-3 py-2 text-sm font-medium text-zinc-300 hover:text-white">Pricing</a>' +
    '<a href="about.html" class="site-nav-link rounded-full px-3 py-2 text-sm font-medium text-zinc-300 hover:text-white">About</a>' +
    '<a href="https://app.hellodilly.com" data-cta="nav" class="ml-1 inline-flex w-auto items-center justify-center rounded-full bg-[#c5a353] px-5 py-2 text-sm font-semibold text-zinc-950 shadow-lg shadow-black/20 transition hover:brightness-110">Get Your Dilly Score</a>' +
    '</nav>' +
    '</div>' +
    '</div>' +
    '</header>';

  var mount = document.getElementById('dilly-site-header');
  if (mount) {
    mount.outerHTML = HEADER_HTML;
  }

  function currentPageHref() {
    var path = '';
    try {
      path = window.location.pathname || '';
    } catch (e) {
      return 'index.html';
    }
    var parts = path.split('/').filter(function (s) {
      return s.length;
    });
    var seg = parts.pop();
    if (!seg) return 'index.html';
    return seg;
  }

  function markActiveNav() {
    var page = currentPageHref();
    var links = document.querySelectorAll('header.site-header nav a.site-nav-link[href]');
    links.forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href.indexOf('http') === 0) return;
      if (href === page) {
        a.setAttribute('aria-current', 'page');
        a.classList.add('site-nav-link--active');
      }
    });
  }

  markActiveNav();

  var btn = document.getElementById('navMenuToggle');
  var panel = document.getElementById('navMenuPanel');
  if (!btn || !panel) return;

  function isMobileNav() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  function setOpen(open) {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    btn.textContent = open ? 'Close' : 'Menu';
    if (isMobileNav()) {
      panel.classList.toggle('hidden', !open);
      if (open) {
        panel.classList.add('flex', 'flex-col');
      } else {
        panel.classList.remove('flex', 'flex-col');
      }
    }
    document.body.style.overflow = open && isMobileNav() ? 'hidden' : '';
    if (!open) {
      panel.classList.remove('is-open');
    }
  }

  btn.addEventListener('click', function () {
    var willOpen = panel.classList.contains('hidden');
    panel.classList.toggle('is-open', willOpen);
    setOpen(willOpen);
  });

  panel.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      if (isMobileNav()) {
        setOpen(false);
      }
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isMobileNav() && !panel.classList.contains('hidden')) {
      setOpen(false);
    }
  });

  try {
    window.matchMedia('(max-width: 767px)').addEventListener('change', function (e) {
      if (!e.matches) {
        setOpen(false);
      }
    });
  } catch (err) {
    /* older browsers */
  }

  // Wire auth state into nav (auth.js must be loaded before site-nav.js on each page)
  if (window.DillyAuth) {
    window.DillyAuth.initNavAuth();
  }
})();
