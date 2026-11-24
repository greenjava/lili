# AGENTS.md

Instructions for AI coding agents working on Lili. Read this before changing code.

## Project

Lili is a browser extension for Chrome and Firefox. It translates, rephrases, corrects and
summarizes the current selection or the whole page. Every task can use a different provider and
model (OpenAI-compatible, Anthropic, Ollama). Requests go directly from the browser to the
configured API; there is no backend.

- Manifest V3 for both browsers, one shared source tree.
- Chrome 116+, Firefox 142+.
- No runtime dependencies, no bundler, no build step for the JavaScript.
- UI and prompts are in French; code, identifiers, comments and commits are in English.
- License: MPL-2.0.

## Non-negotiable rules

- Do not add runtime npm dependencies or a bundler. `devDependencies` are only for tests and
  packaging.
- Keep `src/background.js` a **single classic script**. It is loaded as a Chrome service worker and
  as Firefox background scripts, so ES module imports and multiple files are not allowed.
- Content scripts cannot use imports either. Load order is defined in the manifest:
  `shared/constants.js`, `content/styles.js`, `content/content.js`.
- Build UI nodes with DOM APIs. Never assign dynamic values to `innerHTML`.
- Keep the result-panel UI inside its shadow root with `adoptedStyleSheets`.
- Never log, persist or transmit API keys anywhere except `chrome.storage.local`.
- Do not add telemetry, analytics or remote logging.
- Do not change action ids, storage keys (`settings`, `modelCache`, `clientSession`), message types
  (`lili:*`), the port name (`lili-stream`) or CSS prefixes (`lili-*`) without a migration.
- Do not edit `dist/`, `node_modules/`, `.cache/` or `test/e2e/artifacts/`; they are generated or
  ignored.
- User-visible strings stay in French. Code identifiers and comments stay in English, comments
  short.
- Both READMEs must stay in sync: `README.md` (English, default) and `README.fr.md` (French).

## Repository map

```
src/background.js        settings, menus, shortcuts, providers, prompts, streaming, map-reduce
src/content/content.js   selection capture, toolbar, panel, page extraction, replacement
src/content/styles.js    shadow-root CSS (CSSStyleSheet text)
src/shared/constants.js  action metadata shared by content, popup and options
src/options/             connections, per-task routing, settings page
src/popup/               quick actions popup
src/manifest.base.json   shared manifest; chrome/firefox files are merged over it
scripts/build.mjs        dist/chrome + dist/firefox (+ zips), copies LICENSE
scripts/check.mjs        node --check on src + test/e2e, JSON validation
scripts/verify-version.mjs  package.json vs manifest vs tag
scripts/make-icons.py    PNG icons (Pillow)
test/e2e/                Chrome harness, two fake providers, demo page
.github/workflows/       CI (dev/main/PR) and release (tags v*)
```

## Request flow

1. The content script captures the selection (input, textarea, contenteditable or plain text).
2. It opens a port named `lili-stream` and sends `{ type: 'start', action, text, page, context }`.
3. The background resolves the route for the action, builds the prompt, calls the provider with
   SSE/NDJSON or JSON, and posts `delta`, `status`, `meta`, `done` or `error` messages.
4. The panel appends deltas; replacement uses the DOM references saved at capture time.

`Page` summaries use map-reduce: extract content, chunk it, summarize each chunk without streaming,
then stream the merged summary.

## Settings model

```js
{
  connections: [{ id, label, type, baseUrl, apiKey, model }],
  fallback: { connection, model },
  routing: { [action]: { connection, model } },
  language: { translateTarget, output },
  rephrase: { tone },
  summary: { length },
  limits: { maxPageChars, maxSelectionChars, chunkChars, maxChunks },
  ui: { toolbar, pageAction, autoReplace, actions }
}
```

- Action ids: `translate`, `rephrase_translate`, `rephrase`, `fix`, `summarize`, `summarize_page`.
- Connection types: `openai`, `anthropic`, `ollama`.
- Old settings (`provider` + `providers`) are migrated in `migrateSettings()`; keep this working.
- Route resolution: explicit task connection → fallback connection → first connection. Model: task
  override → connection default → fallback model.
- `ui.actions` drives the floating toolbar; `REPLACEABLE` decides in-place replacement.

## Provider quirks to preserve

- **OVHcloud `Olala-v1.0-translate`**: translation-only. Send a user message plus
  `source_language` / `target_language` in English, no system prompt, and enforce the 12,000
  character limit. Detection is based on the model name.
- **OVHcloud model catalog**: public but returns 403 when sent an invalid token. Model listing
  retries without auth on 401/403. Non-chat models (TTS, Whisper, embeddings, images,
  `context_length: 0`) are filtered.
- **OpenCode Zen/Go**: `chat/completions`. Send `x-opencode-session` for `opencode.ai` hosts; the
  value is stable and stored in `clientSession`. Go requires it. Free models are reserved for the
  OpenCode client and return 403 elsewhere.
- **OpenRouter**: optional `X-Title` header.
- **Ollama**: no API key; needs `OLLAMA_ORIGINS` on the server side.
- **Anthropic**: native messages API with `x-api-key`, `anthropic-version` and the
  dangerous-direct-browser-access header.

## Commands

```bash
npm ci
npm run check          # syntax + JSON; must pass
npm run build          # dist/chrome + dist/firefox
npm run build:zip      # also produces the release zips
npm run lint:firefox   # warnings are errors; must stay clean
npm test               # check + e2e (builds first)
npm run verify:version
npm run icons          # Python + Pillow
```

End-to-end tests need Chrome:

```bash
npx @puppeteer/browsers install chrome@stable --path .cache/chrome
CHROME_PATH=$(find .cache/chrome -type f -name chrome | head -n 1) npm run test:e2e
```

The suite has 37 assertions. Run it after any change to routing, providers, the panel, the popup or
the options page. Set `E2E_ARTIFACTS=1` to write screenshots to `test/e2e/artifacts`.

## Change checklists

### Add an action

1. `src/shared/constants.js`: add to `ACTIONS`, `SELECTION_ACTIONS` and, if replaceable,
   `REPLACEABLE`.
2. `src/background.js`: add the id to `known`, add a prompt branch in `buildMessages`, add the
   routing default.
3. `src/options/options.js`: add the id to `TASKS`.
4. `src/manifest.base.json`: add a shortcut only if needed.
5. Update both READMEs and the e2e settings/assertions.

### Add a provider

1. Add a connection type or reuse `openai` when the API is compatible.
2. `src/background.js`: extend `callModel`, `buildHeaders`, `modelsUrl` and the validation rules.
3. `src/options/options.js`: add a preset with base URL and a model placeholder.
4. Document the quirks in both READMEs and add a mock case in `test/e2e/mock.mjs`.

### Change settings

1. Update `DEFAULT_SETTINGS` and `migrateSettings` in `src/background.js`.
2. Update `options.js` (`load`, `collectStatic`, `serialize`) and the options HTML.
3. Update the e2e settings object and the READMEs.

### Change the UI

1. Keep text French and CSS under `lili-*`.
2. Re-run the e2e suite and refresh `docs/*.png` from the artifacts if the look changed.
3. Keep the panel usable when the meta text is long (`min-width: 0` on the flex item) and keep the
   close button inside the panel.

## Git and release

- `main` is stable; `dev` is the integration branch. Develop on `dev` or short-lived branches.
- Commits follow Gitmoji: one emoji, imperative English subject, factual bullet body.
- Version lives in **both** `package.json` and `src/manifest.base.json`; keep them equal.
- Releases are tags `v*` on a commit of `main`, with a version matching the files. Pushing such a tag
  triggers `.github/workflows/release.yml`, which re-runs lint and the e2e suite before publishing
  the zips.
- CI runs on `dev`, `main` and pull requests; do not merge with a red CI.

## Known traps

- Icons parsed with `DOMParser(..., 'image/svg+xml')` need an explicit
  `xmlns="http://www.w3.org/2000/svg"`, otherwise they are inert (0×0).
- The panel header uses a flexible meta text: it needs `flex: 1 1 auto; min-width: 0` or it pushes
  the action buttons out of the panel.
- `manifest.chrome.json` only overrides `background.service_worker`;
  `manifest.firefox.json` overrides `background.scripts` and adds gecko settings. The build merges
  them over `manifest.base.json`.
- Firefox requires `data_collection_permissions` and `strict_min_version` 142; the lint treats
  warnings as errors.
- The content script runs in the top frame only (`all_frames: false`). Iframe selections are handled
  through the context menu text fallback.
- The e2e harness patches the copied manifest with dynamic mock origins; never add test hosts to the
  real manifest.
- `scripts/build.mjs` needs the `zip` binary for `--zip`.

## Definition of done

- `npm run check` passes.
- `npm run build:zip` passes and both archives contain the expected files.
- `npm run lint:firefox` reports 0 errors and 0 warnings.
- `npm test` passes (or the e2e suite was run manually with Chrome).
- User-visible changes are documented in both READMEs, with refreshed screenshots when relevant.
- The working tree has no generated files staged.
