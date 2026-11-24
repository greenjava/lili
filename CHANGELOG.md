# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Follow-up actions on any result: shorten, expand, make more formal, convert to bullet points or
  explain, with a one-step back to the previous result.
- Stop a running generation and keep the partial result.
- Before/after diff before replacing a selection.
- Optional surrounding-paragraph context for translations, rephrasings and corrections.
- Direct replacement mode: replace editable fields without opening the result panel.
- Local result history with favorites, restore and clear.
- Per-site rules to disable the floating toolbar and force a translation target per domain.
- SHA256 checksums are published with each release.
- Release notes are generated from this changelog.

### Changed

- GitHub Actions workflows now run on Node 24 runtimes.

## [0.3.0] - 2026-11-24

### Added

- Translate, rephrase, rephrase-then-translate, fix and summarize actions on the current selection,
  available from a floating toolbar, the context menu, the popup and keyboard shortcuts.
- In-place replacement in `input`, `textarea` and `contenteditable` fields, with an optional
  automatic replacement mode and undo support.
- Page summaries using map-reduce, with content extraction and section-by-section processing.
- Per-task provider and model routing, with a fallback connection when a task does not define one.
- Connection presets for OpenAI, OpenRouter, OVHcloud AI Endpoints, OpenCode Zen, OpenCode Go,
  Anthropic, Ollama and custom OpenAI-compatible endpoints.
- Automatic model discovery for each connection, cached for seven days, with manual refresh and
  custom model IDs.
- Dedicated support for OVHcloud Olala translation and summarization models.
- Streaming results in a draggable and resizable panel, with light and dark themes.
- FR/EN language detection for automatic translation, and configurable output languages.
- Chrome and Firefox packages built from a single source tree, with English and French
  documentation.

### Fixed

- The result panel header no longer pushes its close button outside the panel when the model name is
  long.
- SVG icons render correctly inside the extension shadow root.
- OVHcloud model listing works when the catalog rejects the configured API token.

### Security

- API keys are stored only in browser extension storage and are never logged or transmitted
  anywhere except the configured provider.
