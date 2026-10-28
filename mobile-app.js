// CollectIQ mobile app shell (v6.26.0)
// On phones the page behaves like an installed app: a 5-tab bottom bar, a centre
// quick-action button, and a "More" sheet that lists every other section.
// Desktop is untouched; everything here is gated on the phone breakpoint.
(function () {
  'use strict';

  var PHONE = window.matchMedia('(max-width: 768px)');
  var TAB_VIEWS = ['dashboard', 'schedule', 'visits'];

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function haptic() {
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* unsupported */ }
  }

  function isHidden(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (n.style && n.style.display === 'none') return true;
    }
    return false;
  }

  // ---------- Sheets ----------
  function openSheet(id) {
    closeSheets();
    var sheet = $(id);
    var scrim = $('mSheetScrim');
    if (!sheet || !scrim) return;
    if (id === 'mMoreSheet') buildMoreSheet();
    scrim.classList.add('open');
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('m-sheet-open');
    haptic();
  }

  function closeSheets() {
    document.querySelectorAll('.m-sheet.open').forEach(function (s) {
      s.classList.remove('open');
      s.setAttribute('aria-hidden', 'true');
    });
    var scrim = $('mSheetScrim');
    if (scrim) scrim.classList.remove('open');
    document.body.classList.remove('m-sheet-open');
  }

  // Swipe a sheet down by its handle to dismiss it.
  function enableSwipeDown(sheet) {
    var startY = null, dy = 0;
    sheet.addEventListener('touchstart', function (e) {
      if (sheet.scrollTop > 0) { startY = null; return; }
      startY = e.touches[0].clientY; dy = 0;
      sheet.style.transition = 'none';
    }, { passive: true });
    sheet.addEventListener('touchmove', function (e) {
      if (startY === null) return;
      dy = Math.max(0, e.touches[0].clientY - startY);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    sheet.addEventListener('touchend', function () {
      if (startY === null) return;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 90) closeSheets();
      startY = null;
    });
  }

  // ---------- More sheet ----------
  function buildMoreSheet() {
    var grid = $('mMoreGrid');
    if (!grid) return;
    var html = '';
    document.querySelectorAll('.sidebar .nav[data-view]').forEach(function (btn) {
      var view = btn.dataset.view;
      if (isHidden(btn)) return;
      var icon = btn.querySelector('i');
      var badge = btn.querySelector('b');
      var label = '';
      btn.childNodes.forEach(function (n) { if (n.nodeType === 3) label += n.textContent; });
      label = label.trim();
      var badgeText = badge ? badge.textContent.trim() : '';
      var showBadge = badgeText && badgeText !== '0';
      html += '<button type="button" class="m-tile' + (btn.classList.contains('active') ? ' active' : '') + '" data-goto="' + esc(view) + '">' +
        '<span class="m-tile-icon">' + (icon ? icon.innerHTML : '') + '</span>' +
        '<span class="m-tile-label">' + esc(label) + '</span>' +
        (showBadge ? '<span class="m-tile-badge">' + esc(badgeText) + '</span>' : '') +
        '</button>';
    });
    grid.innerHTML = html;

    var name = $('userEmail');
    var avatar = $('userAvatar');
    if ($('mMoreName') && name) $('mMoreName').textContent = name.textContent.trim();
    if ($('mMoreAvatar') && avatar) $('mMoreAvatar').textContent = avatar.textContent.trim();
    var db = $('dbBadge');
    if ($('mMoreDb') && db) $('mMoreDb').textContent = db.textContent.replace('●', '').trim();

    var install = $('mMoreInstall');
    var side = $('sideInstallAppBtn');
    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (install) install.style.display = (standalone || (side && side.style.display === 'none' && !isIos())) ? 'none' : '';
  }

  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function goTo(view) {
    closeSheets();
    var btn = document.querySelector('.sidebar .nav[data-view="' + view + '"]');
    if (btn) btn.click();
    else if (typeof window.switchView === 'function') window.switchView(view);
  }

  // ---------- Tab state ----------
  function syncTabs(view) {
    var more = $('mTabMore');
    if (more) more.classList.toggle('active', TAB_VIEWS.indexOf(view) === -1);
    var dot = $('mMoreDot');
    if (dot) {
      var pending = ['helpBadge', 'escalationBadge'].some(function (id) {
        var b = $(id);
        return b && b.textContent.trim() && b.textContent.trim() !== '0';
      });
      dot.style.display = pending ? '' : 'none';
    }
    document.querySelectorAll('.mobile-bottom-nav .mob-badge').forEach(function (b) {
      var t = b.textContent.trim();
      if (!t || t === '0') b.setAttribute('data-zero', '');
      else b.removeAttribute('data-zero');
    });
  }

  function wrapSwitchView() {
    var original = window.switchView;
    if (typeof original !== 'function' || original.__mWrapped) return;
    var wrapped = function (id) {
      var prev = window.currentActiveView;
      var result = original.apply(this, arguments);
      if (PHONE.matches) {
        closeSheets();
        syncTabs(window.currentActiveView || id);
        if (prev !== id) window.scrollTo(0, 0);
      }
      return result;
    };
    wrapped.__mWrapped = true;
    window.switchView = wrapped;
  }

  // ---------- Wiring ----------
  function init() {
    wrapSwitchView();

    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-m-action], [data-goto]');
      if (!t) return;
      if (t.dataset.goto) { haptic(); goTo(t.dataset.goto); return; }
      switch (t.dataset.mAction) {
        case 'more': openSheet('mMoreSheet'); break;
        case 'quick': openSheet('mQuickSheet'); break;
        case 'close': closeSheets(); break;
        case 'followup': closeSheets(); if (window.openFollowup) window.openFollowup(); break;
        case 'payment': closeSheets(); if (window.openPayment) window.openPayment(); break;
        case 'ticket': closeSheets(); if (window.openHelpTicketModal) window.openHelpTicketModal(); break;
        case 'export': closeSheets(); if (window.exportExcel) window.exportExcel(); break;
        case 'install': closeSheets(); if (window.triggerInstallPrompt) window.triggerInstallPrompt(); break;
        case 'password': closeSheets(); if (window.openChangePassword) window.openChangePassword(); break;
        case 'logout': closeSheets(); if (window.logout) window.logout(); break;
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheets();
    });

    document.querySelectorAll('.m-sheet').forEach(enableSwipeDown);

    PHONE.addEventListener && PHONE.addEventListener('change', function () { closeSheets(); });

    syncTabs(window.currentActiveView || 'dashboard');
    // Badges are filled in after data loads; keep the More dot in step.
    setInterval(function () { if (PHONE.matches) syncTabs(window.currentActiveView || 'dashboard'); }, 4000);

    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
      document.documentElement.classList.add('m-standalone');
    }
  }

  window.collectiqMobile = { openSheet: openSheet, closeSheets: closeSheets, goTo: goTo };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
