(function () {
  var HEADER_HTML =
    '<header class="site-header sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-xl">' +
    '<div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-5 md:px-8 md:py-4">' +
    '<a href="index.html" class="relative z-[120] flex min-w-0 shrink-0 items-center">' +
    '<img src="dilly-wordmark.png" alt="Dilly" class="site-header-logo shrink-0" width="612" height="408" decoding="async" />' +
    '</a>' +
    '<button type="button" class="nav-menu-toggle relative z-[120] inline-flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-xl px-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 md:hidden" id="navMenuToggle" aria-label="Open menu" aria-expanded="false" aria-controls="navMenuPanel">Menu</button>' +
    '<div class="nav-menu-panel fixed inset-0 z-[100] hidden overflow-y-auto overscroll-contain border-0 bg-[#0a0a0a]/98 backdrop-blur-xl md:static md:inset-auto md:z-auto md:flex md:max-h-none md:flex-1 md:flex-row md:justify-end md:overflow-visible md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none" id="navMenuPanel">' +
    '<nav class="mx-auto flex w-full max-w-lg flex-col gap-1 px-6 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(6.5rem,env(safe-area-inset-top,0px)+1.5rem)] md:mx-0 md:max-w-none md:flex-row md:items-center md:gap-0 md:rounded-full md:bg-zinc-900/90 md:p-1.5 md:pl-3 md:ring-1 md:ring-white/10 md:px-0 md:pb-0 md:pt-0" aria-label="Main">' +
    '<a href="features.html" class="site-nav-link rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 sm:py-3.5 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">Features</a>' +
    '<a href="how-it-works.html" class="site-nav-link rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 sm:py-3.5 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">How it works</a>' +
    '<a href="tracks.html" class="site-nav-link rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 sm:py-3.5 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">Tracks</a>' +
    '<a href="pricing.html" class="site-nav-link rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 sm:py-3.5 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">Pricing</a>' +
    '<a href="https://app.trydilly.com" target="_blank" rel="noopener noreferrer" data-cta="nav" class="mt-4 inline-flex w-full min-h-[48px] items-center justify-center rounded-2xl bg-[#c5a353] px-5 py-3 text-base font-semibold text-zinc-950 shadow-lg shadow-black/20 transition hover:brightness-110 md:mt-0 md:ml-1 md:w-auto md:rounded-full md:py-2 md:text-sm">Get Your Dilly Score</a>' +
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
})();
