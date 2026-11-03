/*
 * Toolbar popup: debug info for the chat open in the current tab. Asks the
 * tab's bridge.js, which asks page.js; nothing is cached, so opening the popup
 * always shows the latest request.
 */
'use strict';
const api = globalThis.browser || globalThis.chrome;

// Context window sizes in tokens, from the providers' model docs (2026-11).
// The app doesn't record these; add or correct entries as models change.
const CONTEXT_WINDOWS = {
  'gpt-5.2-2025-12-11': 400000,
  'gpt-4.1-2025-04-14': 1047576,
  'claude-opus-5': 1000000,
  'claude-sonnet-5': 1000000,
};

const out = document.getElementById('out');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => (n == null ? '–' : Number(n).toLocaleString());

document.getElementById('open-options').addEventListener('click', e => {
  e.preventDefault();
  api.runtime.openOptionsPage();
  window.close();
});

out.addEventListener('click', async e => {
  const key = e.target.dataset?.copy;
  if (!key) return;
  await navigator.clipboard.writeText(out.querySelector(`pre[data-for="${key}"]`).textContent);
  e.target.textContent = 'Copied';
  setTimeout(() => { e.target.textContent = 'Copy'; }, 1200);
});

function jsonBlock(key, title, value, open) {
  return `<details${open ? ' open' : ''}><summary>${esc(title)}</summary>
    <pre data-for="${key}">${esc(JSON.stringify(value, null, 2))}</pre>
    <button data-copy="${key}">Copy</button></details>`;
}

function render(d) {
  if (d?.error) return `<p class="error">${esc(d.error)}</p>`;
  if (d?.disabled) return '<p class="muted">Debug info is turned off in Settings.</p>';
  const name = (id) => (id ? `${esc(d.names?.[id] || id)} <span class="muted">${esc(id)}</span>` : '–');
  if (!d.sid) return `<h2>Model</h2><p>Selected: ${name(d.selected)}</p><p class="muted">Open a chat to see its usage.</p>`;

  const last = [...(d.replies || [])].reverse().find(r => r.usage);
  const model = last?.model || d.session?.model || d.selected;
  const win = CONTEXT_WINDOWS[model] || null;
  const used = last?.usage?.input_tokens ?? null;
  const pct = win && used != null ? used / win : null;
  const caps = d.capabilities?.[model] || {};
  const s = d.aiContext?.sendObjExample;
  const t = d.aiContext?.toolsNext;

  return `
    <h2>Context window</h2>
    <div class="big">${pct != null ? (pct * 100).toFixed(1) + '%' : '–'}
      <span class="muted" style="font-size:12px;font-weight:400">${num(used)} / ${win ? num(win) : 'unknown window'} tokens</span></div>
    <div class="bar ${pct > 0.9 ? 'full' : pct > 0.7 ? 'warn' : ''}"><div style="width:${Math.min(100, (pct || 0) * 100)}%"></div></div>
    <div class="muted">Input tokens of the last reply: system prompt, tools, injected context and the conversation so far. The next request adds your new message.</div>

    <h2>Model</h2>
    <table>
      <tr><td>Selected now</td><td>${name(d.selected)}</td></tr>
      <tr><td>This chat</td><td>${name(d.session?.model)}</td></tr>
      <tr><td>Last reply</td><td>${name(last?.model)}</td></tr>
      <tr><td>Max output (app)</td><td>${num(caps.maxOutputTokens)}${caps.reasoningEffort ? ` · reasoning effort ${esc(caps.reasoningEffort)}` : ''}</td></tr>
    </table>

    <h2>Replies (${(d.replies || []).length})</h2>
    <table>
      <tr><th>#</th><th>Model</th><th class="n">Input</th><th class="n">Output</th></tr>
      ${(d.replies || []).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(d.names?.[r.model] || r.model || '–')}</td><td class="n">${num(r.usage?.input_tokens)}</td><td class="n">${num(r.usage?.output_tokens)}</td></tr>`).join('')}
    </table>

    <h2>Last request</h2>
    ${d.aiContextError ? `<p class="error">${esc(d.aiContextError)}</p>` : `
    <table>
      <tr><td>Model</td><td>${esc(s?.model || '–')}</td></tr>
      <tr><td>Max output tokens</td><td>${num(s?.max_output_tokens)}</td></tr>
      ${s?.temperature != null ? `<tr><td>Temperature</td><td>${esc(s.temperature)}</td></tr>` : ''}
      <tr><td>Input messages</td><td>${num(s?.inputMessageCount)}</td></tr>
      <tr><td>Sent</td><td>${s?.timestamp ? esc(new Date(s.timestamp).toLocaleString()) : '–'}</td></tr>
      <tr><td>Tools</td><td>${num(t?.toolCount)} (${num(t?.mcpToolCount)} from MCP servers)</td></tr>
      ${d.aiContext?.customInstructions ? '<tr><td>Custom instructions</td><td>yes</td></tr>' : ''}
    </table>
    ${jsonBlock('ctx', 'Full Listen.GetAIContext response', d.aiContext)}`}

    <h2>Conversation</h2>
    <div class="muted">Visible messages only. The system prompt, tools and injected context aren't sent to the browser.</div>
    ${jsonBlock('conv', `Conversation JSON (${(d.conversation || []).length} messages)`, d.conversation)}
    ${d.raw ? `<h2>Raw last request / response</h2>${jsonBlock('raw', 'Exact payload (diagnostic role)', d.raw)}` : ''}`;
}

(async () => {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https:\/\/([^/]+\.)?ozwell\.ai\//.test(tab.url)) {
    out.innerHTML = '<p class="muted">Open Ozwell (ozwell.ai) in this tab to see debug info.</p>';
    return;
  }
  try {
    const data = await api.tabs.sendMessage(tab.id, { type: 'ozw-debug' });
    out.innerHTML = render(data);
  } catch {
    out.innerHTML = '<p class="error">No answer from the page. Reload the Ozwell tab (the extension only attaches to pages loaded after it was installed).</p>';
  }
})();
