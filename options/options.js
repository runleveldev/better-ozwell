/* global OZW_FEATURES, OZW_VARS, ozwMergeSettings */
'use strict';
const api = globalThis.browser || globalThis.chrome;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let settings;

function render() {
  document.getElementById('styles').checked = settings.styles;
  document.getElementById('features').innerHTML = OZW_FEATURES.map(f => `
    <label><input type="checkbox" data-feature="${f.key}" ${settings.features[f.key] ? 'checked' : ''}>
      <span>${esc(f.label)}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</span></label>`).join('');
  document.getElementById('vars').innerHTML = OZW_VARS.map(v => {
    const value = settings.vars[v.key] === v.def ? '' : settings.vars[v.key];
    return `<div class="var"><span>${esc(v.label)}</span>
      <input data-var="${v.key}" value="${esc(value)}" placeholder="${esc(v.def)}"></div>`;
  }).join('');
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await api.storage.local.set({ settings });
    const status = document.getElementById('status');
    status.textContent = 'Saved';
    setTimeout(() => { status.textContent = ''; }, 1200);
  }, 250);
}

document.addEventListener('change', e => {
  if (e.target.id === 'styles') settings.styles = e.target.checked;
  if (e.target.dataset.feature) settings.features[e.target.dataset.feature] = e.target.checked;
  save();
});
document.addEventListener('input', e => {
  const key = e.target.dataset.var;
  if (!key) return;
  const def = OZW_VARS.find(v => v.key === key).def;
  settings.vars[key] = e.target.value.trim() || def;
  save();
});
document.getElementById('reset').addEventListener('click', () => {
  settings = ozwMergeSettings({});
  render();
  save();
});

api.storage.local.get('settings').then(({ settings: stored }) => {
  settings = ozwMergeSettings(stored);
  render();
});
