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

Open the `.xpi` from the [latest release](https://github.com/runleveldev/better-ozwell/releases/latest)
in Firefox and accept the prompt. It's signed by Mozilla (unlisted, so it isn't
listed on addons.mozilla.org) and **updates itself**: Firefox checks
`updates.json` in this repo about once a day, or immediately via
*about:addons → ⚙ → Check for Updates*.

Version 1.0.0 predates automatic updates; install 1.0.1 or later over it once.

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

## Releases

1. Bump `version` in `manifest.json` and `package.json` (AMO won't sign a
   version twice) and commit.
2. Push a matching tag: `git tag v1.0.2 && git push origin v1.0.2`.

`.github/workflows/release.yml` then lints, signs the extension on
addons.mozilla.org as unlisted, creates a GitHub release with the `.xpi`, and
adds it to `updates.json`, which installed copies poll.

Needs repository secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` from
https://addons.mozilla.org/developers/addon/api/key/.

## Development

```sh
npm run lint    # web-ext lint
npm run build   # zip into web-ext-artifacts/
npm run start   # launch a temporary Firefox profile with the extension
```
