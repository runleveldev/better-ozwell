/*
 * Ozwell - Reading Comfort: bridge (isolated content script)
 *
 * - Adds the stylesheet as the last <style> in <head>, so it overrides the
 *   site's own CSS as a user style would (manifest-injected CSS would load
 *   before the site's and lose).
 * - Applies the options page's CSS variables and sends the feature switches
 *   to page.js, live as they change.
 * - Relays the toolbar popup's debug requests to page.js and back.
 */
/* global OZW_DEFAULTS, ozwMergeSettings */

(function () {
  'use strict';
  const api = globalThis.browser || globalThis.chrome;
  let settings = ozwMergeSettings(OZW_DEFAULTS);

  // ----- stylesheet -----
  const style = document.createElement('style');
  style.id = 'ozw-style';
  fetch(api.runtime.getURL('content/style.css'))
    .then(r => r.text())
    .then(css => { style.textContent = css; applyStyles(); });

  function keepLast() {
    if (!settings.styles) return;
    if (document.head && document.head.lastElementChild !== style) document.head.appendChild(style);
  }
  // The app adds <style> elements as it loads; stay after them
  new MutationObserver(keepLast).observe(document.head, { childList: true });

  function applyStyles() {
    if (settings.styles) keepLast(); else style.remove();
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(settings.vars)) {
      if (v === '' || v == null) root.removeProperty(k); else root.setProperty(k, v);
    }
  }

  // ----- page script -----
  function sendConfig() {
    window.postMessage({ source: 'ozw-ext', type: 'config', settings: settings.features }, location.origin);
  }

  const pending = new Map();
  window.addEventListener('message', e => {
    if (e.source !== window || e.data?.source !== 'ozw-page') return;
    if (e.data.type === 'ready') sendConfig();
    if (e.data.type === 'debug-response') {
      pending.get(e.data.id)?.(e.data.data);
      pending.delete(e.data.id);
    }
  });

  function requestDebug() {
    return new Promise(resolve => {
      const id = Math.random().toString(36).slice(2);
      pending.set(id, resolve);
      window.postMessage({ source: 'ozw-ext', type: 'debug-request', id }, location.origin);
      setTimeout(() => { if (pending.delete(id)) resolve({ error: 'The page did not answer. Reload the tab and try again.' }); }, 8000);
    });
  }

  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'ozw-debug') return false;
    requestDebug().then(sendResponse);
    return true;   // async response
  });

  // ----- settings -----
  api.storage.local.get('settings').then(({ settings: stored }) => {
    settings = ozwMergeSettings(stored);
    applyStyles();
    sendConfig();
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    settings = ozwMergeSettings(changes.settings.newValue);
    applyStyles();
    sendConfig();
  });
})();
