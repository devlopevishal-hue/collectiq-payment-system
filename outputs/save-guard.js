// CollectIQ save guard: browser storage that never stops a save half-way, and
// plain-words messages when the live database refuses a save. Pure; no DOM.
(function (root) {
  function isQuotaError(err) {
    if (!err) return false;
    return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 || err.code === 1014 || /quota/i.test(String(err.message || ''));
  }

  // Writes one key; a full or blocked storage is reported instead of thrown, so
  // the save can still go on to the live database.
  function safeSet(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') return { ok: false, full: false };
    try {
      storage.setItem(key, value);
      return { ok: true, full: false };
    } catch (err) {
      return { ok: false, full: isQuotaError(err) };
    }
  }

  // What to tell staff when the live database does not take a save.
  function cloudErrorText(err, label) {
    const what = label ? `${label}: ` : '';
    const code = String((err && err.code) || '');
    const msg = String((err && err.message) || err || '');
    if (/maximum allowed size|exceeds the maximum|too large/i.test(msg)) {
      return `❌ ${what}this party's record is too big for the live database (1 MB limit), so this change was NOT saved there. Tell the admin.`;
    }
    if (code === 'permission-denied' || /permission/i.test(msg)) {
      return `❌ ${what}the live database refused the save (permission). This change was NOT saved there.`;
    }
    if (code === 'resource-exhausted' || /quota|exhausted/i.test(msg)) {
      return `❌ ${what}the live database daily limit is used up. This change was NOT saved there; try again later.`;
    }
    if (code === 'unavailable' || /network|offline|unavailable/i.test(msg)) {
      return `⚠️ ${what}no internet right now. The change is kept on this PC and will be sent when the internet is back.`;
    }
    return `❌ ${what}this change was NOT saved in the live database (${msg.slice(0, 80) || 'unknown error'}). Please press Save again.`;
  }

  // One backup file: every collection as saved, with counts so it can be checked.
  function backupPayload(collections, { source, now, appVersion } = {}) {
    const data = {};
    const counts = {};
    Object.keys(collections || {}).forEach(name => {
      const list = Array.isArray(collections[name]) ? collections[name] : [];
      data[name] = list;
      counts[name] = list.length;
    });
    return { app: 'CollectIQ', appVersion: appVersion || '', source: source || '', exportedAt: (now || new Date()).toISOString(), counts, data };
  }

  // Local date and time in the name, so a new backup never replaces an old one.
  function backupFileName(now) {
    const d = now || new Date();
    const p = n => String(n).padStart(2, '0');
    return `collectiq-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  }

  const api = { isQuotaError, safeSet, cloudErrorText, backupPayload, backupFileName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SaveGuard = api;
})(typeof window !== 'undefined' ? window : globalThis);
