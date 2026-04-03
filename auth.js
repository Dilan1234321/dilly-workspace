/**
 * Dilly Auth — shared auth utility for hellodilly.com
 * Handles email + verification-code sign-in, session storage, and nav state.
 *
 * API_URL: update this when the backend is deployed to production.
 */

(function (global) {
  var DILLY_API_URL = 'https://api.hellodilly.com';
  var APP_URL = 'https://app.hellodilly.com';
  var TOKEN_KEY = 'dilly_session_token';
  var USER_KEY = 'dilly_user';
  var PHOTO_KEY = 'dilly_photo_url';

  // ── Storage helpers ─────────────────────────────────────────────────────────

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch (e) { return null; }
  }

  function getUser() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {}
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(PHOTO_KEY);
    } catch (e) {}
  }

  function isSignedIn() {
    return !!getToken();
  }

  // ── API calls ───────────────────────────────────────────────────────────────

  function apiFetch(path, opts) {
    var token = getToken();
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts && opts.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(DILLY_API_URL + path, Object.assign({}, opts, { headers: headers }));
  }

  /**
   * Send a 6-digit verification code to the given .edu email.
   * Returns { ok, message } or throws with { detail } on error.
   */
  function sendCode(email) {
    return apiFetch('/auth/send-verification-code', {
      method: 'POST',
      body: JSON.stringify({ email: email }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw data;
        return data;
      });
    });
  }

  /**
   * Verify the 6-digit code. On success stores token+user and returns them.
   * Returns { token, user } or throws with { detail } on error.
   */
  function verifyCode(email, code) {
    return apiFetch('/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email: email, code: code }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw data;
        setSession(data.token, data.user);
        return data;
      });
    });
  }

  /**
   * Sign out: clear local session and reload.
   */
  function signOut() {
    var token = getToken();
    clearSession();
    if (token) {
      apiFetch('/auth/logout', { method: 'POST' }).catch(function () {});
    }
    window.location.href = 'index.html';
  }

  /**
   * Fetch profile photo URL (async, best-effort).
   * Caches result in localStorage for the session.
   */
  function fetchPhotoUrl() {
    return new Promise(function (resolve) {
      var cached = null;
      try { cached = sessionStorage.getItem(PHOTO_KEY); } catch (e) {}
      if (cached) { resolve(cached); return; }

      var token = getToken();
      if (!token) { resolve(null); return; }

      fetch(DILLY_API_URL + '/profile/photo', {
        headers: { 'Authorization': 'Bearer ' + token },
      }).then(function (res) {
        if (!res.ok) { resolve(null); return; }
        return res.blob();
      }).then(function (blob) {
        if (!blob || blob.size === 0) { resolve(null); return; }
        var url = URL.createObjectURL(blob);
        try { sessionStorage.setItem(PHOTO_KEY, url); } catch (e) {}
        resolve(url);
      }).catch(function () { resolve(null); });
    });
  }

  // ── Nav injection ───────────────────────────────────────────────────────────

  /**
   * Call this after the nav is injected to wire up auth state.
   * Replaces the CTA button with Dashboard + avatar if signed in.
   */
  function initNavAuth() {
    if (!isSignedIn()) return;
    var user = getUser();
    var email = (user && user.email) || '';
    var initial = email ? email.charAt(0).toUpperCase() : 'D';

    // Find the nav CTA — it's the last <a> in the nav with data-cta="nav"
    var ctaLinks = document.querySelectorAll('header.site-header nav a[data-cta="nav"], header.site-header nav a[href*="app.trydilly"], header.site-header nav a[href*="app.hellodilly"], header.site-header nav a[href*="signin"]');
    var navCta = ctaLinks.length ? ctaLinks[ctaLinks.length - 1] : null;

    if (!navCta) return;

    // Build avatar + Dashboard inline
    var wrapper = document.createElement('span');
    wrapper.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:4px;';

    var dashboard = document.createElement('a');
    dashboard.href = APP_URL;
    dashboard.textContent = 'Dashboard →';
    dashboard.style.cssText = 'display:inline-flex;align-items:center;height:34px;padding:0 16px;border-radius:9999px;background:#c5a353;font-size:13px;font-weight:700;color:#0a0a0a;text-decoration:none;transition:filter 0.15s;white-space:nowrap;';
    dashboard.addEventListener('mouseover', function () { this.style.filter = 'brightness(1.1)'; });
    dashboard.addEventListener('mouseout', function () { this.style.filter = ''; });

    var avatar = document.createElement('div');
    avatar.id = 'nav-avatar';
    avatar.title = email;
    avatar.style.cssText = 'width:32px;height:32px;border-radius:50%;background:#2B3A8E;border:2px solid rgba(197,163,83,0.4);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;cursor:pointer;overflow:hidden;flex-shrink:0;';
    avatar.textContent = initial;

    // Sign-out on avatar click
    var menu = null;
    avatar.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu) { menu.remove(); menu = null; return; }
      menu = document.createElement('div');
      menu.style.cssText = 'position:absolute;top:calc(100% + 6px);right:0;background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:6px;min-width:140px;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:999;';
      var emailLine = document.createElement('div');
      emailLine.style.cssText = 'padding:6px 10px;font-size:11px;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      emailLine.textContent = email;
      var signOutBtn = document.createElement('button');
      signOutBtn.textContent = 'Sign out';
      signOutBtn.style.cssText = 'width:100%;padding:8px 10px;background:none;border:none;color:#ccc;font-size:13px;text-align:left;cursor:pointer;border-radius:6px;';
      signOutBtn.addEventListener('mouseover', function () { this.style.background = 'rgba(255,255,255,0.06)'; });
      signOutBtn.addEventListener('mouseout', function () { this.style.background = 'none'; });
      signOutBtn.addEventListener('click', signOut);
      menu.appendChild(emailLine);
      menu.appendChild(signOutBtn);
      var avatarWrapper = document.createElement('div');
      avatarWrapper.style.cssText = 'position:relative;';
      avatar.parentNode.insertBefore(avatarWrapper, avatar);
      avatarWrapper.appendChild(avatar);
      avatarWrapper.appendChild(menu);
      document.addEventListener('click', function dismissMenu() {
        if (menu) { menu.remove(); menu = null; }
        document.removeEventListener('click', dismissMenu);
      });
    });

    wrapper.appendChild(dashboard);
    wrapper.appendChild(avatar);
    navCta.parentNode.replaceChild(wrapper, navCta);

    // Load photo async
    fetchPhotoUrl().then(function (url) {
      if (!url) return;
      var el = document.getElementById('nav-avatar');
      if (!el) return;
      el.textContent = '';
      var img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
      el.appendChild(img);
    });
  }

  // ── Redirect helpers ────────────────────────────────────────────────────────

  /** Call on pages that require auth (future use). */
  function requireAuth() {
    if (!isSignedIn()) {
      window.location.href = 'signin.html';
    }
  }

  /** After sign-in: go to desktop app. */
  function goToApp() {
    window.location.href = APP_URL;
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  global.DillyAuth = {
    isSignedIn: isSignedIn,
    getUser: getUser,
    getToken: getToken,
    sendCode: sendCode,
    verifyCode: verifyCode,
    signOut: signOut,
    initNavAuth: initNavAuth,
    requireAuth: requireAuth,
    goToApp: goToApp,
  };

})(window);
