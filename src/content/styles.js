// Stylesheet injected into a shadow root (no leaks into the page,
// no page-CSP issues thanks to adoptedStyleSheets).
globalThis.LILI_STYLES = `
:host { all: initial; }

.lili-bar,
.lili-panel,
.lili-toast {
  --bg: #ffffff;
  --fg: #111827;
  --muted: #6b7280;
  --line: #e5e7eb;
  --soft: #f3f4f6;
  --accent: #4f46e5;
  --accent-fg: #ffffff;
  --danger: #b91c1c;
  --danger-bg: #fef2f2;
  --danger-line: #fecaca;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
}

@media (prefers-color-scheme: dark) {
  .lili-bar,
  .lili-panel,
  .lili-toast {
    --bg: #1b1c20;
    --fg: #f3f4f6;
    --muted: #9ca3af;
    --line: #34363d;
    --soft: #26282e;
    --accent: #818cf8;
    --accent-fg: #111827;
    --danger: #fca5a5;
    --danger-bg: #2a1517;
    --danger-line: #7f1d1d;
  }
}

[hidden] { display: none !important; }

/* ---------- Floating bar ---------- */

.lili-bar {
  position: fixed;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 4px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08);
  pointer-events: auto;
  user-select: none;
  animation: lili-in 120ms ease-out;
}

.lili-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  margin: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--fg);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}

.lili-btn:hover { background: var(--soft); }
.lili-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.lili-btn:active { transform: translateY(0.5px); }

.lili-btn svg {
  width: 14px;
  height: 14px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.85;
}

.lili-sep {
  width: 1px;
  align-self: stretch;
  margin: 2px 3px;
  background: var(--line);
}

/* ---------- Result panel ---------- */

.lili-panel {
  position: fixed;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  width: min(440px, calc(100vw - 24px));
  max-height: min(62vh, 540px);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.24), 0 4px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  pointer-events: auto;
  animation: lili-in 140ms ease-out;
}

.lili-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 12px;
  border-bottom: 1px solid var(--line);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.lili-panel.is-dragging .lili-head { cursor: grabbing; }
.lili-panel.is-dragging,
.lili-panel.is-resizing { user-select: none; }

.lili-title {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.lili-meta {
  flex: 1 1 auto;
  min-width: 0;
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lili-iconbtn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.lili-iconbtn:hover { background: var(--soft); color: var(--fg); }
.lili-iconbtn svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }

.lili-body {
  flex: 1 1 auto;
  min-height: 56px;
  padding: 10px 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.lili-text {
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  cursor: text;
  font-size: 13px;
}

.lili-text.is-markdown { white-space: normal; }
.lili-text.is-markdown p { margin: 0 0 6px; }
.lili-text.is-markdown p:last-child { margin-bottom: 0; }

.lili-text.is-markdown h1,
.lili-text.is-markdown h2,
.lili-text.is-markdown h3,
.lili-text.is-markdown h4,
.lili-text.is-markdown h5,
.lili-text.is-markdown h6 {
  margin: 10px 0 4px;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
}

.lili-text.is-markdown h1 { font-size: 15px; }
.lili-text.is-markdown h2 { font-size: 14px; }
.lili-text.is-markdown h3 { font-size: 13px; }

.lili-text.is-markdown ul,
.lili-text.is-markdown ol {
  margin: 0 0 6px;
  padding-left: 18px;
}

.lili-text.is-markdown li { margin: 2px 0; }

.lili-text.is-markdown code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
}

.lili-text.is-markdown pre {
  margin: 6px 0;
  padding: 8px;
  border-radius: 6px;
  background: var(--soft);
  overflow-x: auto;
}

.lili-text.is-markdown pre code { padding: 0; background: none; }

.lili-text.is-markdown blockquote {
  margin: 6px 0;
  padding-left: 8px;
  border-left: 2px solid var(--line);
  color: var(--muted);
}

.lili-text.is-markdown hr {
  margin: 8px 0;
  border: 0;
  border-top: 1px solid var(--line);
}

.lili-panel.is-streaming .lili-text::after {
  content: "";
  display: inline-block;
  width: 6px;
  height: 12px;
  margin-left: 2px;
  vertical-align: -1px;
  background: var(--accent);
  animation: lili-blink 1s steps(2, start) infinite;
}

.lili-status {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--muted);
}

.lili-spinner {
  width: 11px;
  height: 11px;
  flex: none;
  border: 1.5px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: lili-spin 0.7s linear infinite;
}

.lili-error {
  padding: 8px 10px;
  border: 1px solid var(--danger-line);
  border-radius: 8px;
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 12px;
  white-space: pre-wrap;
  user-select: text;
}

.lili-followups {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 6px 10px;
  border-top: 1px dashed var(--line);
}

.lili-followup { padding: 4px 8px; font-size: 11.5px; }

.lili-diff {
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

.lili-diff del {
  background: #fee2e2;
  color: #991b1b;
  text-decoration: line-through;
}

.lili-diff ins {
  background: #dcfce7;
  color: #166534;
  text-decoration: none;
}

@media (prefers-color-scheme: dark) {
  .lili-diff del { background: #3f1d1d; color: #fca5a5; }
  .lili-diff ins { background: #10301f; color: #86efac; }
}

.lili-history { display: flex; flex-direction: column; gap: 6px; }

.lili-history-head {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
}

.lili-history-tab {
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.lili-history-tab:hover { background: var(--soft); color: var(--fg); }
.lili-history-tab.is-active { background: var(--soft); color: var(--fg); font-weight: 600; }

.lili-history-item {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  padding: 5px 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.lili-history-open {
  flex: 1;
  min-width: 0;
  padding: 3px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--fg);
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.lili-history-open:hover { background: var(--soft); }
.lili-history-action { font-size: 11px; font-weight: 600; }
.lili-history-time { margin-left: 6px; font-size: 10px; color: var(--muted); }

.lili-history-preview {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lili-history-empty { padding: 8px 6px; color: var(--muted); font-size: 12px; }
.lili-history .lili-iconbtn { width: 22px; height: 22px; font-size: 15px; line-height: 1; }
.lili-history .lili-iconbtn:hover { color: var(--fg); }

.lili-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 22px 8px 10px;
  border-top: 1px solid var(--line);
}

.lili-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  touch-action: none;
  z-index: 2;
}

.lili-resize::after {
  content: "";
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 8px;
  height: 8px;
  border-right: 1.5px solid var(--muted);
  border-bottom: 1.5px solid var(--muted);
  border-bottom-right-radius: 3px;
  opacity: 0.55;
}

.lili-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: transparent;
  color: var(--fg);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
}

.lili-action:hover { background: var(--soft); }
.lili-action:disabled { opacity: 0.45; cursor: not-allowed; }
.lili-action svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

.lili-action.primary {
  background: var(--accent);
  border-color: transparent;
  color: var(--accent-fg);
}

.lili-action.primary:hover { filter: brightness(1.06); }

.lili-kbd {
  margin-left: auto;
  font-size: 10px;
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* ---------- Toast ---------- */

.lili-toast {
  position: fixed;
  z-index: 2147483647;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: 999px;
  background: #111827;
  color: #f9fafb;
  font-size: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
  pointer-events: none;
  animation: lili-in 140ms ease-out;
}

@media (prefers-color-scheme: dark) {
  .lili-toast { background: #f3f4f6; color: #111827; }
}

@media (max-width: 520px) {
  .lili-bar .lili-lbl { display: none; }
  .lili-bar .lili-btn { padding: 6px; }
}

@media print {
  :host { display: none !important; }
}

@keyframes lili-in {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes lili-spin { to { transform: rotate(360deg); } }
@keyframes lili-blink { 50% { opacity: 0; } }
`;
