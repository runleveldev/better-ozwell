/*
 * Settings definition, shared by bridge.js (content script) and the options
 * page. Stored in browser.storage.local under "settings" as
 * { styles: bool, features: { key: bool }, vars: { "--ozw-...": "value" } }.
 * Missing keys fall back to these defaults.
 */
/* exported OZW_DEFAULTS, OZW_FEATURES, OZW_VARS, ozwMergeSettings */

const OZW_FEATURES = [
  { key: 'preloadSidebar', label: 'Fill the pinned sidebar on load', hint: 'Opens and closes the chat history once, which makes the app load the list.' },
  { key: 'markCurrentChat', label: 'Highlight the current chat in the sidebar' },
  { key: 'sidebarDelete', label: 'Delete button on sidebar chats', hint: 'Shown on hover, for chats you own. Asks before deleting.' },
  { key: 'stripUtmParams', label: 'Strip utm_* tracking parameters from links' },
  { key: 'followConversation', label: 'Keep following replies until you scroll up' },
  { key: 'typeToFocus', label: 'Typing anywhere goes to the chat box' },
  { key: 'fixAbandonRecording', label: 'Fix "Abandon recording"', hint: 'Prevents the stuck recording state and the "Ozwell is transcribing" ghost.' },
  { key: 'backToLastChat', label: 'Back buttons return to your last chat' },
  { key: 'headerTooltips', label: 'Tooltips for the icon-only chat header' },
  { key: 'skipNewChatScreen', label: 'Opening "/" starts a new chat' },
  { key: 'endSessionStartsNew', label: '"New Session" in a chat starts a new chat directly' },
  { key: 'debugPanel', label: 'Debug info in the toolbar popup' },
];

const OZW_VARS = [
  { key: '--ozw-column-width', label: 'Reading column width', def: '800px' },
  { key: '--ozw-text-size', label: 'Message text size', def: '16px' },
  { key: '--ozw-text-line-height', label: 'Message line height', def: '1.7' },
  { key: '--ozw-sidebar-width', label: 'Sidebar width (pinned at 992px+)', def: '320px' },
  { key: '--ozw-sidebar-title-size', label: 'Sidebar title size', def: '0.9rem' },
  { key: '--ozw-sidebar-summary', label: 'Sidebar AI summary (none | block)', def: 'none' },
  { key: '--ozw-sidebar-date', label: 'Sidebar date line (none | inline)', def: 'none' },
  { key: '--ozw-menu-font-size', label: 'Message menu font size', def: '14px' },
  { key: '--ozw-menu-icons', label: 'Message menu icons (none | inline-block)', def: 'none' },
  { key: '--ozw-suggestions', label: 'Suggested-prompt buttons (none | flex)', def: 'none' },
  { key: '--ozw-bubble-max-width', label: 'Prompt bubble max width', def: '70%' },
  { key: '--ozw-code-stripe', label: 'Code stripe colour (transparent = off)', def: 'rgba(127, 127, 127, 0.08)' },
  { key: '--ozw-code-line-numbers', label: 'Code line numbers (block | none)', def: 'block' },
  { key: '--ozw-code-gutter', label: 'Code line-number gutter (0 when off)', def: '3.5em' },
];

const OZW_DEFAULTS = {
  styles: true,
  features: Object.fromEntries(OZW_FEATURES.map(f => [f.key, true])),
  vars: Object.fromEntries(OZW_VARS.map(v => [v.key, v.def])),
};

function ozwMergeSettings(stored) {
  const s = stored || {};
  return {
    styles: s.styles ?? OZW_DEFAULTS.styles,
    features: { ...OZW_DEFAULTS.features, ...(s.features || {}) },
    vars: { ...OZW_DEFAULTS.vars, ...(s.vars || {}) },
  };
}
