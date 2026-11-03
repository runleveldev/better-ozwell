/*
 * Better Ozwell: page script
 *
 * Runs in the page's own JavaScript world ("world": "MAIN"), because it uses
 * the app's Meteor objects and require(). Settings arrive from bridge.js
 * (which can read extension storage) by window.postMessage; nothing runs until
 * they do. Also answers the toolbar popup's debug requests (end of file).
 *
 *   1. Sidebar preload: the app only loads the chat history list when its
 *      sidebar opens. The style pins the sidebar visible, so this script
 *      opens and immediately closes it once, so the list fills in. Desktop
 *      widths only, matching the style.
 *   2. Current chat: marks the sidebar entry for the open chat with
 *      .ozw-current, which the style highlights. (The app's own .active class
 *      is never applied.)
 *   3. Clean links: removes utm_* parameters from link targets and from URLs
 *      written as text in chat replies. Code blocks are left alone. Only the
 *      display changes; the stored reply text keeps the parameters. Text is
 *      cleaned once a reply has stopped streaming, to avoid flicker.
 *   4. Follow the conversation: keeps the chat scrolled to the bottom while
 *      replies stream in, until you scroll up yourself (wheel, touch, keys or
 *      the scrollbar). Scroll back to the bottom, or send a message, to resume.
 *      The app's own auto-scroll switches itself off whenever content briefly
 *      shrinks, e.g. when a tool activity row re-renders, so it stops
 *      following without you touching anything.
 *   5. Type to focus: typing a character while nothing else has focus (no
 *      text field, menu or dialog) moves focus to the chat input, so the
 *      keystroke lands there. Shortcuts with Ctrl/Alt/Meta are left alone.
 *   6. Abandon fix: "Yes, Abandon Recording" runs two or three app handlers
 *      at once. They race, the recorder's "stopped" event is ignored, and the
 *      app stays stuck in the recording state. This runs the abandon exactly
 *      once instead, through the app's own recording module. It then repeats
 *      the server cleanup a few seconds later, because a request the app had
 *      in flight can recreate the recording ("Ozwell is transcribing" forever).
 *   7. Back to last chat: the Back button on Integrations, Billing, Referrals,
 *      Contacts, Developers etc. links to the new chat screen ("/"). Its link
 *      is rewritten to the chat you last had open, unless you came from the
 *      new chat screen.
 *   8. Header tooltips: the style shows the chat header's actions as icons
 *      only. Most already have a tooltip; this gives the rest (e.g. "Report
 *      session") one from their hidden label.
 *   9. No separate new chat screen: opening "/" immediately starts a new,
 *      untitled chat (as its "New Chat Session" button does), so you always
 *      get the full chat view, model switcher included. The header's "End
 *      session" button starts a new chat the same way instead of going to
 *      "/". A new chat stays out of the sidebar until it has a message.
 *  10. Delete from the sidebar: a trash button on each of your own chats in the
 *      sidebar (shown on hover), using the app's Session.Delete. Asks first.
 *      Deleting the chat you're in starts a new one. The server refuses
 *      chats you don't own, workspace memories and support chats.
 *
 */

(function () {
  'use strict';

  // ===== Settings =====
  // Defaults; replaced by the options page's values from bridge.js
  const SETTINGS = {
    preloadSidebar: true,
    markCurrentChat: true,
    stripUtmParams: true,
    followConversation: true,
    typeToFocus: true,
    fixAbandonRecording: true,
    backToLastChat: true,
    headerTooltips: true,
    skipNewChatScreen: true,
    endSessionStartsNew: true,
    sidebarDelete: true,
    debugPanel: true,
    pinnedMinWidth: 992,   // must match the style's @media (min-width: 992px)
  };
  let started = false;

  // ===== 1. Sidebar preload =====
  // Clicks the app's own sidebar toggle, then its close button once the panel
  // has opened. The app bundles Bootstrap as a module (no window.bootstrap),
  // but Bootstrap's click handlers work however it was loaded, and they fire
  // the show.bs.offcanvas event the app uses to load the chat list.
  function preloadSidebar() {
    const el = document.getElementById('offcanvasChatHistory');
    if (!el || el.dataset.ozwPreloaded) return;
    if (window.innerWidth < SETTINGS.pinnedMinWidth) return;

    const toggle = document.querySelector(
      '[data-bs-toggle="offcanvas"][href="#offcanvasChatHistory"], ' +
      '[data-bs-toggle="offcanvas"][data-bs-target="#offcanvasChatHistory"]'
    );
    if (!toggle) return;             // toggle not rendered yet; retry on a later pass
    el.dataset.ozwPreloaded = '1';

    el.addEventListener('shown.bs.offcanvas', () => {
      el.querySelector('[data-bs-dismiss="offcanvas"]')?.click();
    }, { once: true });
    toggle.click();
  }

  // ===== 2. Current chat marker =====
  function markCurrentChat() {
    document.querySelectorAll('#offcanvasChatHistory .session-select').forEach(a => {
      a.classList.toggle('ozw-current', a.getAttribute('href') === location.pathname);
    });
  }

  // ===== 3. Strip utm_* parameters =====
  // The value stops before trailing sentence punctuation, so "...?utm_x=y." keeps its "."
  const UTM_IN_TEXT = /([?&])utm_[a-z0-9_]+=[^&#\s)\]"'<>]*?(?=[.,;:!?]*(?:[&#\s)\]"'<>]|$))/gi;

  // URLs in plain text: drop utm params, then tidy leftover ? and & characters
  const cleanText = (s) =>
    s.replace(UTM_IN_TEXT, '$1')
     .replace(/\?&+/g, '?')
     .replace(/&{2,}/g, '&')
     .replace(/[?&]+(?=[.,;:!]*(?:[#\s)\]"'<>]|$))/g, '');

  // Link targets: use the URL API
  const cleanHref = (href) => {
    try {
      const u = new URL(href, location.href);
      let changed = false;
      for (const key of [...u.searchParams.keys()]) {
        if (key.toLowerCase().startsWith('utm_')) { u.searchParams.delete(key); changed = true; }
      }
      return changed ? u.toString() : href;
    } catch { return href; }
  };

  // Link targets can be cleaned immediately: href changes aren't visible.
  function stripUtmHrefs(root) {
    root.querySelectorAll('a[href*="utm_"]').forEach(a => {
      const clean = cleanHref(a.href);
      if (clean !== a.href) a.href = clean;
    });
  }

  // Visible text is only cleaned once a message has stopped changing. While a
  // reply streams, the app re-renders its text many times a second; cleaning
  // each render made the URLs flicker between the two versions.
  const SETTLE_MS = 1000;
  const lastChanged = new WeakMap();   // message bubble -> time of last change
  let settleTimer = null;

  function noteChanged(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    const bubble = el?.closest?.('.message-bubble');
    if (bubble) lastChanged.set(bubble, Date.now());
  }

  function stripUtmSettled() {
    let waiting = false;
    document.querySelectorAll('.message-area .message-bubble').forEach(b => {
      const since = Date.now() - (lastChanged.get(b) || 0);
      if (since < SETTLE_MS) { waiting = true; return; }
      stripUtmText(b);
    });
    clearTimeout(settleTimer);
    if (waiting) settleTimer = setTimeout(stripUtmSettled, SETTLE_MS);
  }

  function stripUtmText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.nodeValue.includes('utm_') && !n.parentElement?.closest('pre, code')
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const clean = cleanText(n.nodeValue);
      if (clean !== n.nodeValue) n.nodeValue = clean;
    });
  }

  // ===== 4. Follow the conversation =====
  // The app turns its auto-scroll off on any upward scroll position change,
  // including the browser clamping the position when content briefly shrinks
  // (e.g. a tool row re-rendering), so it often stops following on its own.
  // This tracks what *you* do instead: it stays pinned to the bottom until you
  // scroll away yourself, and re-pins when you scroll back down or send.
  const NEAR_BOTTOM = 40;   // px from the bottom that still counts as "at the bottom"
  let following = true;
  let userScrollUntil = 0;  // scroll events before this time came from you
  let sentAt = 0;
  let lastPath = location.pathname;

  const area = () => document.querySelector('.message-area');
  const gap = (a) => a.scrollHeight - a.scrollTop - a.clientHeight;
  const userIntent = (e) => { if (e.target.closest?.('.message-area')) userScrollUntil = Date.now() + 600; };

  document.addEventListener('wheel', userIntent, { capture: true, passive: true });
  document.addEventListener('touchmove', userIntent, { capture: true, passive: true });
  document.addEventListener('pointerdown', userIntent, true);  // scrollbar drag
  document.addEventListener('keydown', e => {
    if (['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '].includes(e.key) &&
        !e.target.closest?.('input, textarea, [contenteditable="true"]')) userScrollUntil = Date.now() + 600;
    if (e.key === 'Enter' && !e.shiftKey && e.target.closest?.('.chat-box-footer')) sentAt = Date.now();
  }, true);
  document.addEventListener('click', e => {
    if (e.target.closest?.('#btn-send-message')) sentAt = Date.now();
    if (e.target.closest?.('.btn-enable-autoscroll')) following = true;  // the app's own button
  }, true);

  // Your scrolling decides whether to keep following
  document.addEventListener('scroll', e => {
    const a = e.target;
    if (!(a instanceof Element) || !a.classList.contains('message-area')) return;
    if (Date.now() < userScrollUntil) following = gap(a) <= NEAR_BOTTOM;
  }, true);

  // Pin to the bottom whenever content changes, if following
  function pin() {
    const a = area();
    if (!a) return;
    if (location.pathname !== lastPath) { lastPath = location.pathname; following = true; }
    if (Date.now() - sentAt < 15000) { following = true; sentAt = 0; }
    if (following && Date.now() >= userScrollUntil && gap(a) > 1) a.scrollTop = a.scrollHeight;
  }
  let pinQueued = false;
  new MutationObserver(() => {
    if (!SETTINGS.followConversation || pinQueued) return;
    pinQueued = true;
    requestAnimationFrame(() => { pinQueued = false; pin(); });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  // ===== 5. Type to focus =====
  // Runs in the capture phase, before the key is delivered. Moving focus there
  // makes the browser deliver this same keystroke to the chat input.
  document.addEventListener('keydown', e => {
    if (!SETTINGS.typeToFocus || e.defaultPrevented || e.isComposing) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;          // shortcuts
    if (e.key.length !== 1 || e.key === ' ') return;          // printable only; Space still scrolls
    const t = document.activeElement;
    const busy = t && t !== document.body && t !== document.documentElement &&
      (t.isContentEditable || t.matches('input, textarea, select, button, a, [tabindex], summary') ||
       t.closest('.modal.show, .dropdown-menu.show, .offcanvas.show'));
    if (busy) return;
    if (document.querySelector('.modal.show')) return;        // a dialog is open
    if (window.getSelection()?.toString()) return;             // you're selecting text
    const input = document.getElementById('chat-input');
    if (!input || input.disabled || input.readOnly || !input.offsetParent) return;
    input.focus({ preventScroll: true });
    const end = input.value.length;
    input.setSelectionRange(end, end);                         // type at the end of any draft
  }, true);

  // ===== 6. Abandon recording fix =====
  // "Yes, Abandon Recording" has two handlers in the abandonRecordingModal
  // template (recorder.js and landing.js), plus a third on the chat page.
  // They each call stopListeningToAudio at the same moment; the extra calls
  // discard the recording state before the recorder reports it has stopped,
  // so the app never leaves the recording state.
  // This blocks the app's handlers and runs the stop exactly once, using the
  // app's own recording module (Meteor exposes require() on the page).
  function listenModule() {
    try { return window.require('/api/listen/listen.js'); } catch { return null; }
  }

  // The abandon only clears the local copy. The app's background sync may
  // still have a request in flight: a chunk upload landing after the server
  // deleted the recording recreates it as "Ozwell is transcribing" forever.
  // So remember each recording's ids from the app's own StartSession calls and
  // repeat the server cleanup once those requests have had time to land.
  const recordingAudioIds = new Map();   // sessionId -> audioId
  (function watchStartSession() {
    const M = window.Meteor;
    if (!M?.callAsync || M.__ozwWatched) return;
    M.__ozwWatched = true;
    const original = M.callAsync.bind(M);
    M.callAsync = function (name, ...args) {
      if (name === 'Listen.StartSession' && (args[0] === 'audio' || args[0] === 'video') && args[1] && args[2]) {
        recordingAudioIds.set(args[1], args[2]);
      }
      return original(name, ...args);
    };
  })();

  function cleanUpAfterAbandon(sessionId) {
    if (!sessionId) return;
    for (const delay of [3000, 10000]) {
      setTimeout(async () => {
        const M = window.Meteor;
        const audioId = recordingAudioIds.get(sessionId);
        if (audioId) {
          await M.callAsync('Listen.AbandonRecording', sessionId, audioId).catch(() => {});
        }
      }, delay);
    }
  }

  document.addEventListener('click', async e => {
    if (!SETTINGS.fixAbandonRecording) return;
    const btn = e.target.closest?.('#btn-confirm-abandon-recording');
    if (!btn) return;
    const m = listenModule();
    if (!m?.stopListeningToAudio) return;          // can't reach it: let the app try
    e.stopImmediatePropagation();
    e.preventDefault();

    // Close the dialog with its own Cancel/close button
    btn.closest('.modal')?.querySelector('[data-bs-dismiss="modal"]')?.click();

    const sessionId = location.pathname.match(/^\/session\/([A-Za-z0-9]+)/)?.[1] || null;
    const recordingSessionId = m.getCurrentSessionId?.() || sessionId;
    try {
      await m.stopListeningToAudio(sessionId, true);  // the app's abandon path, once
    } catch (err) {
      console.error('[ozw] abandon failed', err);
    }
    // Still recording? Force the app's full reset.
    if (m.listening?.get?.() && m.abandonRecording) {
      await m.abandonRecording();
      delete document.body.dataset.abandoning;      // abandonRecording leaves this set
    }
    cleanUpAfterAbandon(recordingSessionId);
    document.getElementById('audio-upload-progress')?.classList.add('d-none');
  }, true);

  // ===== 7. Back to last chat =====
  // Rewrites the Back links' href as they render, so hovering shows the real
  // target and Ctrl/middle-click open the chat too. The app's router handles
  // the click as normal (no page reload).
  // Remembers the last chat page you were on: a chat, or the new chat screen
  // ("/"). The app's own lastSessionId isn't cleared when you go to "/", so it
  // would send you to an older chat.
  const BACK_KEY = 'ozwBackTo';
  function fixBackLinks() {
    const path = location.pathname;
    try {
      if (path === '/' || /^\/session\/[A-Za-z0-9]+$/.test(path)) sessionStorage.setItem(BACK_KEY, path);
    } catch { /* unavailable */ }
    if (path === '/' || path.startsWith('/session/')) return;
    let target = null;
    try { target = sessionStorage.getItem(BACK_KEY); } catch { /* unavailable */ }
    if (!target || target === '/') return;          // "/" is already where Back goes
    document.querySelectorAll('a[href="/"], a[data-ozw-back]').forEach(a => {
      if (!a.querySelector('.fa-arrow-left')) return;
      a.dataset.ozwBack = '1';                       // keep tracking it after the rewrite
      if (a.getAttribute('href') !== target) a.setAttribute('href', target);
    });
  }

  // ===== 8. Header tooltips =====
  function addHeaderTooltips() {
    document.querySelectorAll('#session-header-desktop .nav .nav-link').forEach(a => {
      if (a.title || a.getAttribute('data-bs-original-title')) return;  // has one (Bootstrap moves title here)
      const label = a.querySelector('.nav-label')?.textContent.trim();
      if (label) a.title = label;
    });
  }

  // ===== 9. No separate new chat screen =====
  // Both use the app's own startChatSession: what "/"'s New Chat Session
  // button runs. It creates the session and navigates to it.
  let startingChat = false;
  async function startNewChat(trigger) {
    const m = listenModule();
    if (!m?.startChatSession || startingChat) return false;
    if (m.listening?.get?.()) return false;             // never while recording
    startingChat = true;
    try {
      await m.startChatSession({ currentTarget: trigger || null }, {});
    } finally {
      // startChatSession doesn't await the navigation; allow a retry later
      setTimeout(() => { startingChat = false; }, 3000);
    }
    return true;
  }

  // "/" -> new chat. Once per visit, so a failure (e.g. the usage-limit
  // dialog) doesn't loop.
  let skippedPath = null;
  function skipNewChatScreen() {
    if (location.pathname !== '/') { skippedPath = null; return; }
    if (skippedPath === location.href) return;
    if (!window.Meteor?.userId?.()) return;             // signed out: leave "/" alone
    if (!document.getElementById('wrap-chat-session')) return;   // not rendered yet
    if (document.querySelector('.modal.show')) return;
    skippedPath = location.href;
    // The app restores a saved "/" draft into its input shortly after render,
    // and startChatSession would send it as the first message. Give the draft
    // time to load, and keep "/" if there is one.
    setTimeout(() => {
      if (location.pathname !== '/') return;
      if (document.getElementById('input-new-chat-session')?.value.trim()) return;
      startNewChat(null);
    }, 800);
  }

  // "End session" -> new chat (unless recording: then the app's handler
  // stops the recording as before).
  document.addEventListener('click', e => {
    if (!SETTINGS.endSessionStartsNew) return;
    const btn = e.target.closest?.('#btn-end-session');
    if (!btn) return;
    const m = listenModule();
    if (!m?.startChatSession || m.listening?.get?.()) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    startNewChat(btn);
  }, true);

  // ===== 10. Delete from the sidebar =====
  function sessionsCollection() {
    try { return window.require('/api/listen/listen-collections.js').ListenSessions; } catch { return null; }
  }

  function addDeleteButtons() {
    const Sessions = sessionsCollection();
    const me = window.Meteor?.userId?.();
    if (!Sessions || !me) return;
    document.querySelectorAll('#offcanvasChatHistory a.session-select[href^="/session/"]').forEach(a => {
      if (a.querySelector('.ozw-delete')) return;
      const id = a.getAttribute('href').split('/session/')[1];
      const s = Sessions.findOne(id, { fields: { userId: 1, isWorkspaceMemory: 1, sessionType: 1 } });
      if (!s || s.userId !== me || s.isWorkspaceMemory || s.sessionType === 'support') return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ozw-delete btn btn-sm btn-link text-danger';
      btn.title = 'Delete chat';
      btn.setAttribute('aria-label', 'Delete chat');
      btn.dataset.sessionId = id;
      btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      a.appendChild(btn);
    });
  }

  // The button sits inside the entry's link, so stop the click before the
  // link (and the app's own .session-select handler) sees it.
  document.addEventListener('click', async e => {
    if (!SETTINGS.sidebarDelete) return;
    const btn = e.target.closest?.('.ozw-delete');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const id = btn.dataset.sessionId;
    const title = btn.closest('.session-select')?.querySelector('h5')?.textContent.trim() || 'this chat';
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    try {
      await window.Meteor.callAsync('Session.Delete', id);
      btn.closest('.session-select')?.remove();       // the subscription drops it too
      if (location.pathname === '/session/' + id) startNewChat(null);
    } catch (err) {
      window.alert('Could not delete the chat: ' + (err?.reason || err?.message || err));
    }
  }, true);

  // ===== Run on load and whenever the page changes =====
  // The app is a single-page app (FlowRouter), so watch the DOM instead of
  // page loads. Only childList/characterData are observed, and every write
  // above is skipped when nothing changes, so the script doesn't retrigger itself.
  function run() {
    if (!started) return;
    if (SETTINGS.preloadSidebar) preloadSidebar();
    if (SETTINGS.markCurrentChat) markCurrentChat();
    if (SETTINGS.backToLastChat) fixBackLinks();
    if (SETTINGS.headerTooltips) addHeaderTooltips();
    if (SETTINGS.skipNewChatScreen) skipNewChatScreen();
    if (SETTINGS.sidebarDelete) addDeleteButtons();
    if (SETTINGS.stripUtmParams) {
      document.querySelectorAll('.message-area').forEach(stripUtmHrefs);
      stripUtmSettled();
    }
  }

  let pending = false;
  new MutationObserver((ms) => {
    if (SETTINGS.stripUtmParams) for (const m of ms) noteChanged(m.target);
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; run(); }, 150);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  // ===== Debug data for the toolbar popup =====
  // Plain data only; the popup does the presentation. Reads what the page
  // already has, plus Listen.GetAIContext (a server call, so only on request).
  const req = (path) => { try { return window.require(path); } catch { return null; } };

  async function collectDebug() {
    if (!SETTINGS.debugPanel) return { disabled: true };
    const sid = location.pathname.match(/^\/session\/([A-Za-z0-9]+)/)?.[1] || null;
    const reg = req('@mieweb/harness-core/src/model-registry.js') || {};
    const cols = req('/api/listen/listen-collections.js') || {};
    const selected = window.Package?.session?.Session?.get('selectedAIModel') || null;
    const names = {};
    const name = (id) => { if (id && !names[id]) names[id] = reg.getModelDisplayName?.(id) || id; return id; };
    name(selected);
    const out = { sid, selected, names, capabilities: reg.MODEL_CAPABILITIES || {} };
    if (!sid || !cols.ChatMessages) return out;

    const session = cols.ListenSessions?.findOne(sid);
    out.session = session ? { model: name(session.model), title: session.title || null } : null;
    const all = cols.ChatMessages.find({ sessionId: sid }, { sort: { createdAt: 1 } }).fetch();
    out.replies = all.filter(m => !m.user && (m.model || m.usage))
      .map(m => ({ model: name(m.model), usage: m.usage || null, createdAt: m.createdAt }));
    out.conversation = all.filter(m => m.message).map(m => ({
      role: m.message.role || (m.user ? 'user' : 'assistant'),
      content: m.message.content ?? m.message,
      ...(m.type && m.type !== 'text' ? { type: m.type } : {}),
      ...(m.model ? { model: m.model } : {}),
      ...(m.usage ? { usage: m.usage } : {}),
      createdAt: m.createdAt,
    }));

    try {
      out.aiContext = await window.Meteor.callAsync('Listen.GetAIContext', sid);
    } catch (e) {
      out.aiContextError = e?.reason || e?.message || String(e);
    }

    // Exact request/response: only published to admin/super-admin/helpdesk
    if (cols.TempAISendLog) {
      const handle = window.Meteor.subscribe('TempAISendLog.bySession', sid);
      for (let i = 0; i < 20 && !handle.ready(); i++) await new Promise(r => setTimeout(r, 100));
      const log = cols.TempAISendLog.findOne({ sessionId: sid, type: { $exists: false } }, { sort: { createdAt: -1 } });
      handle.stop();
      if (log) {
        const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; } };
        out.raw = { createdAt: log.createdAt, request: parse(log.request), response: parse(log.response) };
      }
    }
    // Structured-clone safe (Dates and plain objects only)
    return JSON.parse(JSON.stringify(out));
  }

  // ===== Messages from bridge.js =====
  window.addEventListener('message', async e => {
    if (e.source !== window || e.data?.source !== 'ozw-ext') return;
    if (e.data.type === 'config') {
      Object.assign(SETTINGS, e.data.settings || {});
      if (!started) { started = true; }
      run();
    } else if (e.data.type === 'debug-request') {
      let data;
      try { data = await collectDebug(); } catch (err) { data = { error: String(err?.message || err) }; }
      window.postMessage({ source: 'ozw-page', type: 'debug-response', id: e.data.id, data }, location.origin);
    }
  });
  window.postMessage({ source: 'ozw-page', type: 'ready' }, location.origin);
})();
