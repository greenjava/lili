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
}

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

.lili-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-top: 1px solid var(--line);
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
