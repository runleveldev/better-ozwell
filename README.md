# Better Ozwell

A Firefox (and Chrome) extension for [Ozwell](https://app.ozwell.ai) that replaces
the earlier "Ozwell - Reading Comfort" Stylus style and Tampermonkey scripts:

- **Reading styles:** centred, width-capped message column; system font instead of
  Nunito; chat history pinned open on desktop with a compact list; tighter
  message menus and chat header; striped, line-numbered code blocks.
- **Behaviour fixes:** see Settings for the full list, each with its own switch:
  sidebar preload and current-chat highlight, delete buttons on sidebar chats,
  utm_* link cleanup, following replies as they stream, type-anywhere-to-chat,
  the "Abandon recording" fix, Back buttons returning to your last chat, and
  starting new chats directly instead of through the "/" screen.
- **Debug popup:** click the toolbar icon on an Ozwell tab for the model in use,
  context window usage, per-reply token counts, the last request's settings and
  tools, and the conversation as JSON.

## Install in Firefox (140+)

Release Firefox only installs signed extensions permanently. Options:

1. **Temporary (no signing):** `about:debugging#/runtime/this-firefox` →
   *Load Temporary Add-on…* → pick `manifest.json` in this folder. Removed when
   Firefox restarts.
2. **Permanent, unsigned:** Firefox Developer Edition, Nightly or ESR with
   `xpinstall.signatures.required` set to `false` in `about:config`, then install
   the `.zip` from `npm run build` via *about:addons → ⚙ → Install Add-on From File*.
3. **Permanent, signed:** submit the build to addons.mozilla.org as an
   *unlisted* (self-distributed) add-on. Mozilla signs it without a public
   listing and returns an `.xpi` you can install in any Firefox.

## Install in Chrome / Edge (111+)

`chrome://extensions` → enable *Developer mode* → *Load unpacked* → this folder.

## Settings

Toolbar icon → *Settings*, or the add-on's preferences. Changes apply to open
Ozwell tabs immediately. Style values are CSS (`800px`, `1.7`, `none`, …).

## Layout

| Path | Purpose |
|---|---|
| `content/style.css` | Page styles. Injected as the last `<style>` in `<head>` so they override the site's CSS. |
| `content/page.js` | Behaviour features and the debug data collector. Runs in the page's own JS world (`"world": "MAIN"`) because it uses the app's Meteor objects. |
| `content/bridge.js` | Isolated content script: injects the CSS, applies settings, relays debug requests between the popup and `page.js`. |
| `common/settings.js` | Feature list, style variables and defaults, shared by the bridge and the options page. |
| `popup/` | Debug popup. Context window sizes live in `popup.js` (`CONTEXT_WINDOWS`); the app doesn't record them. |
| `options/` | Settings page. |

## Development

```sh
npm run lint    # web-ext lint
npm run build   # zip into web-ext-artifacts/
npm run start   # launch a temporary Firefox profile with the extension
```
