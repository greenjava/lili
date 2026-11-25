// Content script: captures the selection, shows the floating bar and result panel,
// and replaces text inside editable fields.
(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  if (!api || !api.runtime || !api.runtime.id) return;
  if (window.__liliReady) return;
  window.__liliReady = true;

  const LILI = globalThis.LILI || {};
  const I18N = globalThis.LILI_I18N || { t: (key) => key, locale: 'en' };
  const t = (key, substitutions) => I18N.t(key, substitutions);
  const ACTIONS = LILI.ACTIONS || {};
  const REPLACEABLE = new Set(LILI.REPLACEABLE || []);
  const FOLLOW_UPS = LILI.FOLLOW_UPS || [];
  const FALLBACK_ACTIONS = LILI.SELECTION_ACTIONS || ['translate', 'rephrase', 'summarize'];

  const MIN_SELECTION = 2;
  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', '']);

  const ICONS = {
    translate:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3Z"/></svg>',
    sparkles:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3l1.7 4.6L17 9.3l-4.3 1.7L11 15.6 9.3 11 5 9.3l4.3-1.7Z"/><path d="M18 14l.8 2.2 2.2.8-2.2.8L18 20l-.8-2.2-2.2-.8 2.2-.8Z"/></svg>',
    shuffle:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3.2c2 0 3.2 1.3 4.4 3.2s2.4 3.2 4.4 3.2H20"/><path d="M17 10.4l3 3-3 3"/><path d="M4 17h3.2c1.3 0 2.3-.6 3.2-1.6"/><path d="M14.8 8.1c.7-.7 1.6-1.1 2.8-1.1H20"/><path d="M17 4l3 3-3 3"/></svg>',
    list:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l4.8 4.8L20 6.8"/></svg>',
    page:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>',
    copy:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    replace:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h11a3 3 0 0 1 3 3v1"/><path d="M15 5l3 3-3 3"/><path d="M20 16H9a3 3 0 0 1-3-3v-1"/><path d="M9 19l-3-3 3-3"/></svg>',
    retry:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    compare:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18"/><path d="M5 7h4M5 12h4M5 17h4M15 7h4M15 12h4M15 17h4"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    history:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  };

  // -------------------------------------------------------- UI construction

  function node(tag, props, children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null) continue;
      if (key === 'class') element.className = value;
      else if (key === 'text') element.textContent = value;
      else element.setAttribute(key, value);
    }
    for (const child of children || []) if (child) element.appendChild(child);
    return element;
  }

  function iconNode(name) {
    const markup = ICONS[name];
    if (!markup) return document.createTextNode('');
    try {
      // XML parsing needs an explicit namespace, unlike inline HTML <svg>.
      const source = markup.includes('xmlns=')
        ? markup
        : markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      const root = parsed.documentElement;
      if (!root || root.nodeName === 'parsererror') return document.createTextNode('');
      return document.importNode(root, true);
    } catch {
      return document.createTextNode('');
    }
  }

  function actionButton(name, icon, label, primary) {
    const button = node('button', {
      type: 'button',
      class: 'lili-action' + (primary ? ' primary' : ''),
      'data-ui': name,
    });
    button.appendChild(iconNode(icon));
    button.appendChild(document.createTextNode(label));
    return button;
  }

  function buildUI() {
    const bar = node('div', {
      class: 'lili-bar',
      role: 'toolbar',
      'aria-label': t('panel_toolbar_label'),
      hidden: '',
    });

    const title = node('span', { class: 'lili-title', text: t('panel_result') });
    const meta = node('span', { class: 'lili-meta' });

    const historyBtn = node('button', {
      type: 'button',
      class: 'lili-iconbtn',
      'data-ui': 'history',
      title: t('panel_history'),
      'aria-label': t('panel_history'),
    });
    historyBtn.appendChild(iconNode('history'));

    const settingsBtn = node('button', {
      type: 'button',
      class: 'lili-iconbtn',
      'data-ui': 'settings',
      title: t('panel_settings'),
      'aria-label': t('panel_settings'),
    });
    settingsBtn.appendChild(iconNode('settings'));

    const closeBtn = node('button', {
      type: 'button',
      class: 'lili-iconbtn',
      'data-ui': 'close',
      title: t('panel_close'),
      'aria-label': t('panel_close_short'),
    });
    closeBtn.appendChild(iconNode('close'));

    const head = node('div', { class: 'lili-head' }, [
      title,
      meta,
      historyBtn,
      settingsBtn,
      closeBtn,
    ]);

    const text = node('div', { class: 'lili-text' });
    const error = node('div', { class: 'lili-error', hidden: '' });
    const statusText = node('span', { class: 'lili-status-text' });
    const status = node('div', { class: 'lili-status', hidden: '' }, [
      node('span', { class: 'lili-spinner' }),
      statusText,
    ]);
    const historyView = node('div', { class: 'lili-history', hidden: '' });
    const body = node('div', { class: 'lili-body' }, [text, historyView, error, status]);
    const followUps = node('div', { class: 'lili-followups', hidden: '' });

    const replaceBtn = actionButton('replace', 'replace', t('panel_replace'), true);
    replaceBtn.title = t('panel_replace_title');
    replaceBtn.setAttribute('aria-label', t('panel_replace_title'));
    replaceBtn.hidden = true;
    replaceBtn.disabled = true;

    const copyBtn = actionButton('copy', 'copy', t('panel_copy'));
    copyBtn.disabled = true;

    const retryBtn = actionButton('retry', 'retry', t('panel_retry'));
    retryBtn.disabled = true;

    const stopBtn = actionButton('stop', 'stop', t('panel_stop'));
    stopBtn.hidden = true;

    const confirmBtn = actionButton('confirm', 'replace', t('panel_confirm'), true);
    confirmBtn.hidden = true;

    const cancelBtn = actionButton('cancel-compare', 'close', t('panel_cancel'));
    cancelBtn.hidden = true;

    const foot = node('div', { class: 'lili-foot' }, [
      replaceBtn,
      copyBtn,
      retryBtn,
      stopBtn,
      confirmBtn,
      cancelBtn,
      node('span', { class: 'lili-kbd', text: t('panel_escape') }),
    ]);

    const resizeHandle = node('div', {
      class: 'lili-resize',
      'aria-hidden': 'true',
      title: t('panel_resize'),
    });

    const panel = node(
      'div',
      { class: 'lili-panel', role: 'dialog', 'aria-label': t('panel_dialog_label'), hidden: '' },
      [head, body, followUps, foot, resizeHandle]
    );

    const toast = node('div', { class: 'lili-toast', role: 'status', hidden: '' });

    return {
      bar,
      panel,
      toast,
      title,
      meta,
      body,
      text,
      error,
      status,
      statusText,
      replaceBtn,
      copyBtn,
      retryBtn,
      stopBtn,
      confirmBtn,
      cancelBtn,
      followUps,
      historyBtn,
      history: historyView,
      foot,
    };
  }

  let ui = null;
  let settings = null;
  let sel = null;
  let job = null;
  let lastRequest = null;
  let toastTimer = null;
  let panelView = 'result';
  let historyEntries = [];
  let historyFilter = 'all';

  // ----------------------------------------------------------------- settings

  async function loadSettings() {
    try {
      settings = await api.runtime.sendMessage({ type: 'lili:get-settings' });
    } catch {
      settings = null;
    }
    if (ui) renderBar();
    if (siteDisabled()) hideBar();
  }

  // --------------------------------------------------------------------- UI

  function ensureUI() {
    if (ui) return ui;

    const host = document.createElement('div');
    host.id = 'lili-root';
    host.setAttribute('data-lili', '1');
    host.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'open' });

    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(globalThis.LILI_STYLES || '');
      shadow.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = globalThis.LILI_STYLES || '';
      shadow.appendChild(style);
    }

    const parts = buildUI();
    shadow.append(parts.bar, parts.panel, parts.toast);

    (document.documentElement || document.body).appendChild(host);

    ui = {
      host,
      shadow,
      bar: parts.bar,
      panel: parts.panel,
      title: parts.title,
      meta: parts.meta,
      body: parts.body,
      text: parts.text,
      error: parts.error,
      status: parts.status,
      statusText: parts.statusText,
      replaceBtn: parts.replaceBtn,
      copyBtn: parts.copyBtn,
      retryBtn: parts.retryBtn,
      stopBtn: parts.stopBtn,
      confirmBtn: parts.confirmBtn,
      cancelBtn: parts.cancelBtn,
      followUps: parts.followUps,
      historyBtn: parts.historyBtn,
      history: parts.history,
      foot: parts.foot,
      toast: parts.toast,
    };

    ui.textNode = document.createTextNode('');
    ui.text.appendChild(ui.textNode);

    shadow.addEventListener('click', onClick);
    ui.panel.addEventListener('pointerdown', onPanelPointerDown);
    ui.panel.addEventListener('pointermove', onPanelPointerMove);
    ui.panel.addEventListener('pointerup', onPanelPointerEnd);
    ui.panel.addEventListener('pointercancel', onPanelPointerEnd);
    shadow.addEventListener('mousedown', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button')) event.preventDefault();
    });

    ui.body.addEventListener(
      'scroll',
      () => {
        if (!job) return;
        job.stick =
          ui.body.scrollHeight - ui.body.scrollTop - ui.body.clientHeight < 24;
      },
      { passive: true }
    );

    renderBar();
    return ui;
  }

  function barButton(id) {
    const action = ACTIONS[id];
    if (!action) return null;

    const button = node('button', {
      type: 'button',
      class: 'lili-btn',
      'data-action': id,
      title: t(action.hintKey || action.labelKey),
      'aria-label': t(action.labelKey),
    });
    button.appendChild(iconNode(action.icon));
    button.appendChild(
      node('span', { class: 'lili-lbl', text: t(action.shortKey || action.labelKey) })
    );
    return button;
  }

  function renderBar() {
    if (!ui) return;
    const configured =
      settings && Array.isArray(settings.ui && settings.ui.actions) && settings.ui.actions.length
        ? settings.ui.actions
        : FALLBACK_ACTIONS;

    const items = configured.filter((id) => ACTIONS[id] && id !== 'summarize_page');
    const showPage = !settings || !settings.ui || settings.ui.pageAction !== false;

    ui.bar.textContent = '';

    for (const id of items) {
      const button = barButton(id);
      if (button) ui.bar.appendChild(button);
    }

    if (showPage && ACTIONS.summarize_page) {
      ui.bar.appendChild(node('span', { class: 'lili-sep' }));
      const pageButton = barButton('summarize_page');
      if (pageButton) ui.bar.appendChild(pageButton);
    }
  }

  // --------------------------------------------------------------- selection

  function isTextField(el) {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      const type = (el.type || 'text').toLowerCase();
      return TEXT_INPUT_TYPES.has(type) && !el.disabled && !el.readOnly;
    }
    return false;
  }

  function findEditable(node) {
    let el = node && node.nodeType === 3 ? node.parentElement : node;
    for (let depth = 0; el && depth < 12; depth++) {
      if (el === ui || (ui && ui.host && ui.host.contains(el))) return null;
      if (el.isContentEditable === true) {
        if (el.closest && el.closest('[contenteditable="false"]')) return null;
        return el;
      }
      if (el.closest && el.closest('[contenteditable="false"]')) return null;
      el = el.parentElement;
    }
    return null;
  }

  function firstRect(range) {
    const rects = range.getClientRects();
    for (const rect of rects) {
      if (rect.width > 0 && rect.height > 0) return rect;
    }
    const rect = range.getBoundingClientRect();
    return rect && (rect.width > 0 || rect.height > 0) ? rect : null;
  }

  function insideUI(event) {
    if (!ui) return false;
    try {
      return event.composedPath().includes(ui.host);
    } catch {
      return false;
    }
  }

  const CONTEXT_TAGS = new Set([
    'P', 'LI', 'DIV', 'ARTICLE', 'SECTION', 'BLOCKQUOTE', 'TD', 'TH',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FIGCAPTION', 'PRE',
  ]);

  function readContext(selection) {
    if (!settings || !settings.ui || !settings.ui.context) return '';
    try {
      if (selection.kind === 'input') {
        const value = selection.el.value || '';
        const start = Math.max(0, selection.start - 700);
        const end = Math.min(value.length, selection.end + 700);
        return value.slice(start, end).trim().slice(0, 2000);
      }

      if (selection.range) {
        let element = selection.range.startContainer;
        if (element.nodeType === 3) element = element.parentElement;

        while (element && element !== document.body && !CONTEXT_TAGS.has(element.tagName)) {
          element = element.parentElement;
        }

        if (element && element !== document.body) {
          const blockText = (element.innerText || element.textContent || '').trim();
          if (blockText.length > selection.text.trim().length) {
            return blockText.slice(0, 2000);
          }
        }

        const root = selection.range.commonAncestorContainer;
        const rootText = (root.textContent || '').trim();
        if (rootText.length > selection.text.trim().length) return rootText.slice(0, 2000);
      }
    } catch {
      /* ignore */
    }
    return '';
  }

  function selectionMarkdown(range) {
    let fragment;
    try {
      fragment = range.cloneContents();
    } catch {
      return '';
    }

    const parts = [];

    const walk = (node) => {
      if (node.nodeType === 3) {
        parts.push(node.nodeValue.replace(/\s+/g, ' '));
        return;
      }
      if (node.nodeType !== 1) return;

      const tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript') return;

      if (tag === 'br') {
        parts.push('\n');
        return;
      }

      if (tag === 'pre') {
        const code = node.textContent.replace(/^\n+|\n+$/g, '');
        parts.push('\n\n```\n' + code + '\n```\n\n');
        return;
      }

      const heading = /^h([1-6])$/.exec(tag);
      const list = tag === 'ul' || tag === 'ol';
      const item = tag === 'li';
      const quote = tag === 'blockquote';
      const bold = tag === 'strong' || tag === 'b';
      const italic = tag === 'em' || tag === 'i';
      const code = tag === 'code';

      if (bold) parts.push('**');
      if (italic) parts.push('*');
      if (code) parts.push('`');
      if (heading) parts.push('\n\n' + '#'.repeat(Number(heading[1])) + ' ');
      if (quote) parts.push('\n\n> ');

      if (item) {
        const parent = node.parentElement;
        if (parent && parent.tagName === 'OL') {
          const index = Array.prototype.indexOf.call(parent.children, node) + 1;
          parts.push('\n' + index + '. ');
        } else {
          parts.push('\n- ');
        }
      } else if (list) {
        parts.push('\n');
      }

      for (const child of node.childNodes) walk(child);

      if (bold) parts.push('**');
      if (italic) parts.push('*');
      if (code) parts.push('`');

      if (heading || quote || list) parts.push('\n\n');
      else if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') parts.push('\n\n');
    };

    for (const child of fragment.childNodes) walk(child);

    return parts
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 20000);
  }

  function readSelection() {
    const active = document.activeElement;
    if (isTextField(active)) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (typeof start === 'number' && typeof end === 'number' && end > start) {
        const text = active.value.slice(start, end);
        if (text && text.trim().length >= 1) {
          const rect = active.getBoundingClientRect();
          const candidate = {
            kind: 'input',
            el: active,
            start,
            end,
            text,
            rect: rect && rect.height ? rect : null,
          };
          candidate.context = readContext(candidate);
          return candidate;
        }
      }
      return null;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const text = selection.toString();
    if (!text || !text.trim()) return null;

    const range = selection.getRangeAt(0);
    if (ui && ui.host && (ui.host.contains(range.commonAncestorContainer) ||
      range.commonAncestorContainer === ui.host)) {
      return null;
    }

    const rect = firstRect(range);
    const editable = findEditable(range.commonAncestorContainer);
    const candidate = {
      kind: editable ? 'contenteditable' : 'text',
      el: editable,
      range: range.cloneRange(),
      text,
      rect: rect || null,
    };
    candidate.context = readContext(candidate);
    candidate.richText = selectionMarkdown(range);
    return candidate;
  }

  function isReplaceable(selection) {
    if (!selection || !REPLACEABLE.has(job && job.action)) return false;
    if (selection.kind === 'input') {
      return !!(selection.el && selection.el.isConnected);
    }
    if (selection.kind === 'contenteditable') {
      return !!(selection.el && selection.el.isConnected && selection.range);
    }
    return false;
  }

  // -------------------------------------------------------------- positioning

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function placeBar(rect) {
    const bar = ui.bar;
    const width = bar.offsetWidth;
    const height = bar.offsetHeight;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left + rect.width / 2 - width / 2;
    left = clamp(left, 6, Math.max(6, vw - width - 6));

    let top = rect.top - height - 8;
    if (top < 6) top = rect.bottom + 8;
    if (top + height > vh - 6) top = Math.max(6, vh - height - 6);

    bar.style.left = Math.round(left) + 'px';
    bar.style.top = Math.round(top) + 'px';
  }

  function placePanel(rect) {
    const panel = ui.panel;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;

    let left;
    let top;

    if (rect) {
      left = rect.left;
      top = rect.bottom + 10;
      if (top + height > vh - 8) {
        const above = rect.top - height - 10;
        top = above >= 8 ? above : Math.max(8, vh - height - 8);
      }
    } else {
      left = (vw - width) / 2;
      top = Math.max(64, (vh - height) / 2 - 40);
    }

    left = clamp(left, 8, Math.max(8, vw - width - 8));
    top = clamp(top, 8, Math.max(8, vh - height - 8));

    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }

  function hostMatches(host, rule) {
    const normalized = String(rule || '').toLowerCase();
    return !!normalized && (host === normalized || host.endsWith('.' + normalized));
  }

  function siteDisabled() {
    const rules = settings && settings.siteRules && settings.siteRules.disabled;
    if (!Array.isArray(rules) || !rules.length) return false;
    const host = location.hostname.toLowerCase();
    return rules.some((rule) => hostMatches(host, rule));
  }

  function showBar(selection) {
    ensureUI();
    if (settings && settings.ui && settings.ui.toolbar === false) return;
    if (siteDisabled()) return;
    if (!selection || !selection.rect) return;
    ui.bar.hidden = false;
    placeBar(selection.rect);
  }

  function hideBar() {
    if (ui) ui.bar.hidden = true;
  }

  // ------------------------------------------------------------------- panel

  let panelSize = null;
  let panelPointer = null;

  function applyPanelSize() {
    if (!ui) return;

    if (!panelSize) {
      ui.panel.style.width = '';
      ui.panel.style.height = '';
      ui.panel.style.maxHeight = '';
      return;
    }

    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(panelSize.width, Math.max(280, vw - 16));
    const height = Math.min(panelSize.height, Math.max(160, vh - 16));

    ui.panel.style.width = Math.round(width) + 'px';
    ui.panel.style.height = Math.round(height) + 'px';
    ui.panel.style.maxHeight = 'none';
  }

  function startPanelPointer(event, mode) {
    const rect = ui.panel.getBoundingClientRect();
    panelPointer = {
      mode,
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };

    ui.panel.classList.add(mode === 'drag' ? 'is-dragging' : 'is-resizing');
    try {
      ui.panel.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    event.preventDefault();
  }

  function onPanelPointerDown(event) {
    if (!ui || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('.lili-resize')) {
      startPanelPointer(event, 'resize');
      return;
    }
    if (target.closest('button, a, input, select, textarea')) return;
    if (!target.closest('.lili-head')) return;

    startPanelPointer(event, 'drag');
  }

  function onPanelPointerMove(event) {
    if (!panelPointer || event.pointerId !== panelPointer.id) return;

    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;

    if (panelPointer.mode === 'drag') {
      const width = ui.panel.offsetWidth;
      const left = clamp(
        panelPointer.left + event.clientX - panelPointer.x,
        8,
        Math.max(8, vw - width - 8)
      );
      const top = clamp(
        panelPointer.top + event.clientY - panelPointer.y,
        8,
        Math.max(8, vh - 48)
      );
      ui.panel.style.left = Math.round(left) + 'px';
      ui.panel.style.top = Math.round(top) + 'px';
    } else {
      const minWidth = Math.min(300, vw - 16);
      const minHeight = 160;
      const maxWidth = Math.max(minWidth, vw - panelPointer.left - 8);
      const maxHeight = Math.max(minHeight, vh - panelPointer.top - 8);

      const width = clamp(panelPointer.width + event.clientX - panelPointer.x, minWidth, maxWidth);
      const height = clamp(panelPointer.height + event.clientY - panelPointer.y, minHeight, maxHeight);

      panelSize = { width: Math.round(width), height: Math.round(height) };
      ui.panel.style.width = panelSize.width + 'px';
      ui.panel.style.height = panelSize.height + 'px';
      ui.panel.style.maxHeight = 'none';
    }

    event.preventDefault();
  }

  function onPanelPointerEnd(event) {
    if (!panelPointer || event.pointerId !== panelPointer.id) return;

    ui.panel.classList.remove('is-dragging', 'is-resizing');
    try {
      ui.panel.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    panelPointer = null;
  }

  function setStatus(text) {
    if (!ui) return;
    if (!text) {
      ui.status.hidden = true;
      return;
    }
    ui.status.hidden = false;
    ui.statusText.textContent = text;
  }

  function resetPanel(action, anchor, keepPosition) {
    panelView = 'result';
    ui.title.textContent = (ACTIONS[action] && t(ACTIONS[action].labelKey)) || action;
    ui.meta.textContent = '';
    ui.meta.title = '';
    delete ui.meta.dataset.direction;
    ui.text.textContent = '';
    ui.text.classList.remove('is-markdown');
    ui.text.appendChild(ui.textNode);
    ui.textNode.data = '';
    ui.error.hidden = true;
    ui.error.textContent = '';
    ui.replaceBtn.hidden = true;
    ui.replaceBtn.disabled = true;
    ui.confirmBtn.hidden = true;
    ui.cancelBtn.hidden = true;
    ui.stopBtn.hidden = false;
    ui.copyBtn.hidden = false;
    ui.copyBtn.disabled = true;
    ui.retryBtn.hidden = false;
    ui.retryBtn.disabled = true;
    ui.followUps.hidden = true;
    ui.followUps.textContent = '';
    ui.history.hidden = true;
    ui.history.textContent = '';
    ui.text.hidden = false;
    ui.foot.hidden = false;
    ui.historyBtn.disabled = true;
    ui.panel.classList.add('is-streaming');
    ui.body.scrollTop = 0;
    job = { action, text: '', stick: true };
    ui.panel.hidden = false;
    applyPanelSize();
    setStatus(t('panel_sending'));
    if (!keepPosition) placePanel(anchor);
  }

  function appendDelta(text) {
    if (!ui || !job) return;
    job.text += text;
    ui.textNode.appendData(text);
    if (job.stick) ui.body.scrollTop = ui.body.scrollHeight;
    job.ticks = (job.ticks || 0) + 1;
    if (job.ticks % 6 === 0) keepPanelInView();
  }

  function keepPanelInView() {
    const rect = ui.panel.getBoundingClientRect();
    const overflow = rect.bottom - (window.innerHeight - 8);
    if (overflow > 0) {
      const top = Math.max(8, rect.top - overflow);
      ui.panel.style.top = Math.round(top) + 'px';
    }
  }

  function appendInline(parent, text, depth) {
    if (depth > 2) {
      parent.appendChild(document.createTextNode(text));
      return;
    }

    const patterns = [
      { re: /\*\*([^*\n]+)\*\*/, tag: 'strong' },
      { re: /__([^_\n]+)__/, tag: 'strong' },
      { re: /`([^`\n]+)`/, tag: 'code' },
      { re: /\*([^*\n]+)\*/, tag: 'em' },
      { re: /(?<!\w)_([^_\n]+)_(?!\w)/, tag: 'em' },
    ];

    let rest = String(text || '');

    while (rest) {
      let best = null;

      for (const pattern of patterns) {
        const match = pattern.re.exec(rest);
        if (match && (!best || match.index < best.index)) {
          best = {
            index: match.index,
            length: match[0].length,
            inner: match[1],
            tag: pattern.tag,
          };
        }
      }

      if (!best) {
        parent.appendChild(document.createTextNode(rest));
        return;
      }

      if (best.index > 0) {
        parent.appendChild(document.createTextNode(rest.slice(0, best.index)));
      }

      const element = document.createElement(best.tag);
      appendInline(element, best.inner, depth + 1);
      parent.appendChild(element);
      rest = rest.slice(best.index + best.length);
    }
  }

  function renderMarkdown(text) {
    const fragment = document.createDocumentFragment();
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    let paragraph = [];
    let list = null;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      const element = document.createElement('p');
      appendInline(element, paragraph.join('\n'));
      fragment.appendChild(element);
      paragraph = [];
    };

    const flushList = () => {
      if (!list) return;
      fragment.appendChild(list.element);
      list = null;
    };

    let index = 0;

    while (index < lines.length) {
      const line = lines[index];

      if (/^\s*```/.test(line)) {
        flushParagraph();
        flushList();
        const code = [];
        index++;
        while (index < lines.length && !/^\s*```/.test(lines[index])) {
          code.push(lines[index]);
          index++;
        }
        index++;
        const pre = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.textContent = code.join('\n');
        pre.appendChild(codeEl);
        fragment.appendChild(pre);
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
        index++;
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        flushList();
        const element = document.createElement('h' + heading[1].length);
        appendInline(element, heading[2]);
        fragment.appendChild(element);
        index++;
        continue;
      }

      if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
        flushParagraph();
        flushList();
        fragment.appendChild(document.createElement('hr'));
        index++;
        continue;
      }

      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        flushParagraph();
        flushList();
        const element = document.createElement('blockquote');
        appendInline(element, quote[1]);
        fragment.appendChild(element);
        index++;
        continue;
      }

      const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);

      if (bullet || ordered) {
        flushParagraph();
        const type = bullet ? 'ul' : 'ol';
        if (!list || list.type !== type) {
          flushList();
          list = { type, element: document.createElement(type) };
        }
        const item = document.createElement('li');
        appendInline(item, (bullet || ordered)[1]);
        list.element.appendChild(item);
        index++;
        continue;
      }

      flushList();
      paragraph.push(line.trim());
      index++;
    }

    flushParagraph();
    flushList();
    return fragment;
  }

  function markdownToPlain(text) {
    return String(text || '')
      .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '- ')
      .replace(/^\s*>\s?/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function setResultView() {
    if (!ui || !job) return;

    const scroll = ui.body.scrollTop;
    ui.text.textContent = '';
    ui.textNode.data = job.text;

    const markdown = !settings || !settings.ui || settings.ui.markdown !== false;

    if (markdown && job.text.trim()) {
      ui.text.classList.add('is-markdown');
      ui.text.appendChild(renderMarkdown(job.text));
    } else {
      ui.text.classList.remove('is-markdown');
      ui.text.appendChild(ui.textNode);
    }

    ui.body.scrollTop = scroll;
  }

  function renderFollowUps() {
    if (!ui) return;
    ui.followUps.textContent = '';

    if (!job || !job.finished || !job.text.trim() || job.comparing) {
      ui.followUps.hidden = true;
      return;
    }

    if (job.previous) {
      const back = actionButton('back', 'retry', t('panel_back'));
      back.classList.add('lili-followup');
      ui.followUps.appendChild(back);
      ui.followUps.appendChild(node('span', { class: 'lili-sep' }));
    }

    for (const id of FOLLOW_UPS) {
      const meta = ACTIONS[id];
      if (!meta) continue;
      const button = node('button', {
        type: 'button',
        class: 'lili-action lili-followup',
        'data-followup': id,
        title: t(meta.hintKey || meta.labelKey),
      });
      button.textContent = t(meta.shortKey || meta.labelKey);
      ui.followUps.appendChild(button);
    }

    ui.followUps.hidden = !ui.followUps.children.length;
  }

  function updateActionButtons(canReplace) {
    ui.replaceBtn.hidden = !canReplace;
    ui.replaceBtn.disabled = !canReplace || !job || !job.text.trim();
    ui.copyBtn.hidden = false;
    ui.copyBtn.disabled = !job || !job.text.trim();
    ui.retryBtn.hidden = false;
    ui.retryBtn.disabled = !lastRequest;
  }

  function finishJob(info) {
    if (!ui || !job) return;
    job.finished = true;
    ui.panel.classList.remove('is-streaming');
    ui.stopBtn.hidden = true;
    setStatus('');

    if (info && info.model) {
      const direction = ui.meta.dataset.direction || '';
      const label = [direction, info.model].filter(Boolean).join(' · ');
      ui.meta.textContent = label;
      ui.meta.title = [info.provider, info.model].filter(Boolean).join(' / ');
    }

    ui.historyBtn.disabled = false;
    const canReplace = !!(lastRequest && isReplaceable(lastRequest.selection));
    updateActionButtons(canReplace);

    if (!job.fromHistory && job.text.trim()) {
      addHistoryEntry(job.action, job.text.trim());
    }

    if (job.direct) {
      if (canReplace && job.text.trim()) {
        const ok = replaceSelection(lastRequest.selection, job.text.trim());
        closePanel();
        toast(ok ? t('toast_replaced') : t('toast_replace_failed'));
      } else {
        ui.panel.hidden = false;
        job.direct = false;
        renderFollowUps();
      }
      return;
    }

    setResultView();

    if (
      settings &&
      settings.ui &&
      settings.ui.autoReplace &&
      canReplace &&
      job.text.trim() &&
      REPLACEABLE.has(job.action)
    ) {
      const ok = replaceSelection(lastRequest.selection, job.text.trim());
      if (ok) {
        closePanel();
        toast(t('toast_replaced'));
        return;
      }
    }

    renderFollowUps();
  }

  function failJob(message) {
    if (!ui || !job) return;
    job.finished = true;
    job.comparing = false;

    if (job.direct) {
      job.direct = false;
      ui.panel.hidden = false;
    }

    ui.panel.classList.remove('is-streaming');
    ui.stopBtn.hidden = true;
    ui.followUps.hidden = true;
    ui.confirmBtn.hidden = true;
    ui.cancelBtn.hidden = true;
    ui.historyBtn.disabled = false;
    setStatus('');
    ui.error.hidden = false;
    ui.error.textContent = message;

    const canReplace = !!(lastRequest && isReplaceable(lastRequest.selection)) && !!job.text.trim();
    ui.replaceBtn.hidden = !canReplace;
    ui.replaceBtn.disabled = !canReplace;
    ui.copyBtn.hidden = false;
    ui.copyBtn.disabled = !job.text.trim();
    ui.retryBtn.hidden = false;
    ui.retryBtn.disabled = !lastRequest;
  }

  function closePanel() {
    if (!ui) return;
    abortJob();
    ui.panel.hidden = true;
    ui.error.hidden = true;
    ui.confirmBtn.hidden = true;
    ui.cancelBtn.hidden = true;
    ui.stopBtn.hidden = true;
    ui.followUps.hidden = true;
    ui.history.hidden = true;
    ui.history.textContent = '';
    ui.text.hidden = false;
    ui.foot.hidden = false;
    ui.historyBtn.disabled = false;
    ui.textNode.data = '';
    setStatus('');
    panelView = 'result';
    job = null;
  }

  function stopJob() {
    if (!ui || !job || !job.port) return;

    const port = job.port;
    job.port = null;
    job.finished = true;
    job.stopped = true;

    try {
      port.postMessage({ type: 'abort' });
      port.disconnect();
    } catch {
      /* ignore */
    }

    ui.panel.classList.remove('is-streaming');
    ui.stopBtn.hidden = true;
    ui.historyBtn.disabled = false;
    setStatus(t('panel_stopped'));

    const canReplace = !!(lastRequest && isReplaceable(lastRequest.selection));
    updateActionButtons(canReplace);
    setResultView();
    renderFollowUps();
  }

  function abortJob() {
    if (!job || !job.port) return;
    try {
      job.port.postMessage({ type: 'abort' });
    } catch {
      /* already closed */
    }
    try {
      job.port.disconnect();
    } catch {
      /* already closed */
    }
    job.port = null;
  }

  // --------------------------------------------------------------- history

  function addHistoryEntry(action, text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    try {
      const pending = api.runtime.sendMessage({ type: 'lili:history-add', action, text: clean });
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function timeLabel(at) {
    const diff = Date.now() - Number(at || 0);
    if (!Number.isFinite(diff) || diff < 0) return '';
    if (diff < 60000) return t('panel_history_now');
    if (diff < 3600000) return t('panel_history_minutes', [String(Math.round(diff / 60000))]);
    if (diff < 86400000) return t('panel_history_hours', [String(Math.round(diff / 3600000))]);
    return new Date(at).toLocaleDateString(I18N.locale);
  }

  async function openHistory() {
    if (!ui) return;
    if (job && job.port && !job.finished) return;

    panelView = 'history';
    historyFilter = 'all';
    ui.title.textContent = t('panel_history');
    ui.meta.textContent = '';
    ui.meta.title = '';
    delete ui.meta.dataset.direction;
    ui.text.hidden = true;
    ui.error.hidden = true;
    ui.status.hidden = true;
    ui.followUps.hidden = true;
    ui.foot.hidden = true;
    ui.history.hidden = false;
    ui.body.scrollTop = 0;
    ui.history.textContent = '';
    ui.history.appendChild(node('div', { class: 'lili-history-empty', text: t('panel_history_loading') }));

    try {
      const response = await api.runtime.sendMessage({ type: 'lili:history-list' });
      historyEntries = (response && response.history) || [];
    } catch {
      historyEntries = [];
    }

    renderHistory();
  }

  function renderHistory() {
    if (!ui) return;
    ui.history.textContent = '';

    const head = node('div', { class: 'lili-history-head' });
    for (const [id, label] of [[['all', t('panel_history_all')], ['favorites', t('panel_history_favorites')]]]) {
      head.appendChild(
        node('button', {
          type: 'button',
          class: 'lili-history-tab' + (historyFilter === id ? ' is-active' : ''),
          'data-history-tab': id,
          text: label,
        })
      );
    }

    const clear = node('button', {
      type: 'button',
      class: 'lili-action',
      'data-history-clear': '1',
      text: t('panel_history_clear'),
    });
    clear.style.marginLeft = 'auto';
    head.appendChild(clear);
    ui.history.appendChild(head);

    const entries =
      historyFilter === 'favorites' ? historyEntries.filter((entry) => entry.favorite) : historyEntries;

    if (!entries.length) {
      ui.history.appendChild(
        node('div', {
          class: 'lili-history-empty',
          text: historyFilter === 'favorites' ? t('panel_history_no_favorites') : t('panel_history_empty'),
        })
      );
      return;
    }

    for (const entry of entries) {
      const item = node('div', { class: 'lili-history-item' });

      const open = node('button', {
        type: 'button',
        class: 'lili-history-open',
        'data-history-open': entry.id,
      });
      open.appendChild(
        node('span', {
          class: 'lili-history-action',
          text: (ACTIONS[entry.action] && t(ACTIONS[entry.action].labelKey)) || entry.action || t('panel_result'),
        })
      );
      open.appendChild(node('span', { class: 'lili-history-time', text: timeLabel(entry.at) }));
      open.appendChild(
        node('span', {
          class: 'lili-history-preview',
          text: markdownToPlain(entry.text).replace(/\s+/g, ' ').slice(0, 140),
        })
      );
      item.appendChild(open);

      const star = node('button', {
        type: 'button',
        class: 'lili-iconbtn',
        'data-history-fav': entry.id,
        title: entry.favorite ? t('panel_history_remove_favorite') : t('panel_history_add_favorite'),
      });
      star.textContent = entry.favorite ? '★' : '☆';
      item.appendChild(star);

      const remove = node('button', {
        type: 'button',
        class: 'lili-iconbtn',
        'data-history-remove': entry.id,
        title: t('panel_history_remove'),
      });
      remove.textContent = '×';
      item.appendChild(remove);

      ui.history.appendChild(item);
    }
  }

  async function toggleHistoryFavorite(id) {
    const entry = historyEntries.find((item) => item.id === id);
    if (!entry) return;
    try {
      const response = await api.runtime.sendMessage({
        type: 'lili:history-favorite',
        id,
        favorite: !entry.favorite,
      });
      if (response && response.history) historyEntries = response.history;
    } catch {
      /* ignore */
    }
    renderHistory();
  }

  async function removeHistoryEntry(id) {
    try {
      const response = await api.runtime.sendMessage({ type: 'lili:history-remove', id });
      if (response && response.history) historyEntries = response.history;
    } catch {
      /* ignore */
    }
    renderHistory();
  }

  async function clearHistoryEntries() {
    if (!confirm(t('panel_history_clear_confirm'))) return;
    try {
      const response = await api.runtime.sendMessage({ type: 'lili:history-clear' });
      if (response && response.history) historyEntries = response.history;
    } catch {
      /* ignore */
    }
    renderHistory();
  }

  function openHistoryEntry(id) {
    const entry = historyEntries.find((item) => item.id === id);
    if (!entry) return;

    panelView = 'result';
    ui.history.hidden = true;
    ui.text.hidden = false;
    ui.foot.hidden = false;
    ui.error.hidden = true;
    ui.followUps.hidden = true;
    ui.title.textContent = (ACTIONS[entry.action] && t(ACTIONS[entry.action].labelKey)) || t('panel_result');
    ui.meta.textContent = timeLabel(entry.at);
    ui.meta.title = new Date(entry.at).toLocaleString(I18N.locale);
    delete ui.meta.dataset.direction;

    job = {
      action: entry.action,
      text: entry.text,
      finished: true,
      fromHistory: true,
      stick: false,
    };
    lastRequest = null;

    setResultView();
    ui.confirmBtn.hidden = true;
    ui.cancelBtn.hidden = true;
    ui.stopBtn.hidden = true;
    ui.copyBtn.hidden = false;
    ui.retryBtn.hidden = false;
    updateActionButtons(false);
    renderFollowUps();
    setStatus('');
    ui.body.scrollTop = 0;
  }

  // --------------------------------------------------------------- actions

  function buildRequest(action, options) {
    const opts = options || {};
    const selection = opts.selection || sel || readSelection();
    const isPage = action === 'summarize_page';

    if (!isPage) {
      if (!selection || !selection.text || !selection.text.trim()) return null;
    }

    return {
      action,
      text: isPage ? '' : selection.richText || selection.text,
      page: isPage ? extractPage() : null,
      context: { title: document.title, url: location.href },
      contextText: isPage ? '' : (selection && selection.context) || '',
      selection: isPage ? null : selection || null,
      anchor: selection && selection.rect ? selection.rect : null,
    };
  }

  function runRequest(request, options) {
    if (!request) return;
    const opts = options || {};
    ensureUI();
    hideBar();

    const anchor = request.action === 'summarize_page' ? null : request.anchor;
    resetPanel(request.action, anchor, !!opts.keepPosition);
    lastRequest = request;
    job.previous = opts.previous || null;
    job.followUp = !!request.followUp;

    const direct =
      !opts.keepPosition &&
      settings &&
      settings.ui &&
      settings.ui.directMode &&
      request.action !== 'summarize_page' &&
      request.selection &&
      (request.selection.kind === 'input' || request.selection.kind === 'contenteditable') &&
      REPLACEABLE.has(request.action);

    if (direct) {
      job.direct = true;
      ui.panel.hidden = true;
      toast(t('toast_processing'));
    }

    if (request.action === 'summarize_page' && (!request.page || request.page.text.length < 150)) {
      failJob(
        t('error_page_too_short')
      );
      return;
    }

    let port;
    try {
      port = api.runtime.connect({ name: 'lili-stream' });
    } catch (error) {
      failJob(
        t('error_extension_unreachable', [
          (error && error.message) || t('error_unknown_detail'),
        ])
      );
      return;
    }

    job.port = port;
    job.selection = request.selection;
    job.request = request;

    port.onMessage.addListener((message) => {
      if (!ui || !job) return;
      if (message.type === 'delta') {
        if (ui.status.hidden === false && job.text.length === 0) setStatus('');
        appendDelta(message.text || '');
      } else if (message.type === 'status') {
        setStatus(message.text || '');
      } else if (message.type === 'meta') {
        if (message.text) {
          ui.meta.dataset.direction = message.text;
          ui.meta.textContent = message.text;
        }
      } else if (message.type === 'done') {
        finishJob(message);
      } else if (message.type === 'error') {
        failJob(message.message || 'Erreur inconnue.');
      }
    });

    port.onDisconnect.addListener(() => {
      if (!job || job.port !== port) return;
      const err = api.runtime.lastError;
      job.port = null;
      if (!job.finished) {
        failJob(
          (err && err.message) || t('error_connection_lost')
        );
      }
    });

    try {
      port.postMessage({
        type: 'start',
        action: request.action,
        text: request.text,
        page: request.page,
        context: request.context,
        contextText: request.contextText || '',
      });
    } catch (error) {
      failJob(
        t('error_send_failed', [(error && error.message) || t('error_unknown_detail')])
      );
    }
  }

  function onClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const historyTab = target.closest('[data-history-tab]');
    if (historyTab) {
      event.preventDefault();
      historyFilter = historyTab.getAttribute('data-history-tab');
      renderHistory();
      return;
    }

    const historyClear = target.closest('[data-history-clear]');
    if (historyClear) {
      event.preventDefault();
      clearHistoryEntries();
      return;
    }

    const historyOpen = target.closest('[data-history-open]');
    if (historyOpen) {
      event.preventDefault();
      openHistoryEntry(historyOpen.getAttribute('data-history-open'));
      return;
    }

    const historyFav = target.closest('[data-history-fav]');
    if (historyFav) {
      event.preventDefault();
      toggleHistoryFavorite(historyFav.getAttribute('data-history-fav'));
      return;
    }

    const historyRemove = target.closest('[data-history-remove]');
    if (historyRemove) {
      event.preventDefault();
      removeHistoryEntry(historyRemove.getAttribute('data-history-remove'));
      return;
    }

    const followUpBtn = target.closest('[data-followup]');
    if (followUpBtn) {
      event.preventDefault();
      event.stopPropagation();
      startFollowUp(followUpBtn.getAttribute('data-followup'));
      return;
    }

    const actionBtn = target.closest('[data-action]');
    if (actionBtn) {
      event.preventDefault();
      event.stopPropagation();
      const action = actionBtn.getAttribute('data-action');
      const request = buildRequest(action, {});
      if (!request) {
        toast(t('toast_select_text'));
        return;
      }
      runRequest(request);
      return;
    }

    const button = target.closest('[data-ui]');
    if (!button) return;
    const kind = button.getAttribute('data-ui');

    if (kind === 'close') closePanel();
    else if (kind === 'copy') doCopy();
    else if (kind === 'replace') doReplace();
    else if (kind === 'retry') doRetry();
    else if (kind === 'stop') stopJob();
    else if (kind === 'confirm') confirmReplace();
    else if (kind === 'cancel-compare') cancelCompare();
    else if (kind === 'back') restorePrevious();
    else if (kind === 'history') openHistory();
    else if (kind === 'settings') {
      try {
        api.runtime.sendMessage({ type: 'lili:open-options' });
      } catch {
        /* ignore */
      }
    }
  }

  async function doCopy() {
    if (!job || !job.text.trim()) return;
    const ok = await copyText(markdownToPlain(job.text));
    toast(ok ? t('toast_copied') : t('toast_copy_failed'));
  }

  function renderDiff(before, after) {
    let start = 0;
    const maxStart = Math.min(before.length, after.length);
    while (start < maxStart && before[start] === after[start]) start++;

    let beforeEnd = before.length;
    let afterEnd = after.length;
    while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
      beforeEnd--;
      afterEnd--;
    }

    const removed = before.slice(start, beforeEnd);
    const added = after.slice(start, afterEnd);

    ui.text.textContent = '';
    ui.text.classList.remove('is-markdown');

    if (!removed && !added) {
      ui.text.appendChild(document.createTextNode(t('panel_no_changes')));
      return;
    }

    const diff = node('div', { class: 'lili-diff' });
    diff.appendChild(document.createTextNode(before.slice(0, start)));

    if (removed) {
      const del = document.createElement('del');
      del.textContent = removed;
      diff.appendChild(del);
    }
    if (added) {
      const ins = document.createElement('ins');
      ins.textContent = added;
      diff.appendChild(ins);
    }

    diff.appendChild(document.createTextNode(before.slice(beforeEnd)));
    ui.text.appendChild(diff);
  }

  function doReplace() {
    if (!ui || !job || !lastRequest || !job.text.trim()) return;
    if (!isReplaceable(lastRequest.selection)) return;

    job.comparing = true;
    job.stick = false;
    ui.followUps.hidden = true;
    ui.replaceBtn.hidden = true;
    ui.copyBtn.hidden = true;
    ui.retryBtn.hidden = true;
    ui.stopBtn.hidden = true;
    ui.confirmBtn.hidden = false;
    ui.cancelBtn.hidden = false;
    ui.body.scrollTop = 0;
    renderDiff(lastRequest.selection.text, markdownToPlain(job.text.trim()));
    setStatus(t('panel_compare_hint'));
  }

  function confirmReplace() {
    if (!job || !lastRequest || !job.text.trim()) return;
    const ok = replaceSelection(lastRequest.selection, job.text.trim());
    if (ok) {
      closePanel();
      toast(t('toast_replaced'));
    } else {
      toast(t('toast_replace_failed_changed'));
    }
  }

  function cancelCompare() {
    if (!ui || !job) return;
    job.comparing = false;
    setResultView();
    ui.confirmBtn.hidden = true;
    ui.cancelBtn.hidden = true;
    ui.copyBtn.hidden = false;
    ui.retryBtn.hidden = false;
    setStatus('');

    const canReplace = !!(lastRequest && isReplaceable(lastRequest.selection));
    updateActionButtons(canReplace);
    renderFollowUps();
  }

  function startFollowUp(actionId) {
    if (!ui || !job || !job.text.trim()) return;

    const previous = {
      action: job.action,
      text: job.text,
      meta: ui.meta.textContent,
      direction: ui.meta.dataset.direction || '',
      request: lastRequest,
    };

    const request = {
      action: actionId,
      text: job.text.trim(),
      contextText: '',
      page: null,
      context: { title: document.title, url: location.href },
      selection: lastRequest ? lastRequest.selection : null,
      anchor: null,
      followUp: true,
    };

    runRequest(request, { previous, keepPosition: true });
  }

  function restorePrevious() {
    if (!ui || !job || !job.previous) return;

    const previous = job.previous;
    if (previous.request) lastRequest = previous.request;
    job.action = previous.action;
    job.text = previous.text;
    job.previous = null;
    job.finished = true;
    job.comparing = false;

    ui.title.textContent = (ACTIONS[job.action] && t(ACTIONS[job.action].labelKey)) || job.action;
    ui.meta.textContent = previous.meta || '';
    ui.meta.title = '';
    if (previous.direction) ui.meta.dataset.direction = previous.direction;
    else delete ui.meta.dataset.direction;

    setResultView();
    ui.confirmBtn.hidden = true;
    ui.cancelBtn.hidden = true;
    ui.copyBtn.hidden = false;
    ui.retryBtn.hidden = false;
    setStatus('');

    const canReplace = !!(lastRequest && isReplaceable(lastRequest.selection));
    updateActionButtons(canReplace);
    renderFollowUps();
  }

  function doRetry() {
    if (!lastRequest) return;
    const request = {
      ...lastRequest,
      page: lastRequest.action === 'summarize_page' ? extractPage() : null,
    };
    runRequest(request);
  }

  // ------------------------------------------------------------- replacement

  function replaceSelection(selection, text) {
    if (!selection) return false;
    if (selection.kind === 'input') {
      return replaceInField(selection.el, selection.start, selection.end, markdownToPlain(text));
    }
    if (selection.kind === 'contenteditable') {
      return replaceInEditable(selection.el, selection.range, text);
    }
    return false;
  }

  function fireInput(el, text) {
    try {
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertReplacementText',
          data: text,
        })
      );
    } catch {
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
  }

  function replaceInField(el, start, end, text) {
    if (!el || !el.isConnected) return false;
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      start < 0 ||
      end > el.value.length ||
      end < start
    ) {
      return false;
    }

    try {
      el.focus({ preventScroll: true });
      el.setSelectionRange(start, end);
      el.setRangeText(text, start, end, 'end');
    } catch {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (!descriptor || !descriptor.set) return false;
      const value = el.value;
      descriptor.set.call(el, value.slice(0, start) + text + value.slice(end));
      try {
        const caret = start + text.length;
        el.setSelectionRange(caret, caret);
      } catch {
        /* some inputs reject setSelectionRange */
      }
    }

    fireInput(el, text);
    return true;
  }

  const HTML_TAGS = new Set([
    'p', 'br', 'hr', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
  ]);

  function escapeHtml(value) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value).replace(/[&<>"']/g, (char) => map[char]);
  }

  function nodeToHtml(node, inPre, inline) {
    if (node.nodeType === 3) {
      const escaped = escapeHtml(node.nodeValue);
      return inPre ? escaped : escaped.replace(/\n/g, '<br>');
    }
    if (node.nodeType !== 1) return '';

    const tag = node.tagName.toLowerCase();
    const inner = Array.from(node.childNodes)
      .map((child) => nodeToHtml(child, inPre || tag === 'pre', inline))
      .join('');

    if (!HTML_TAGS.has(tag)) return inner;
    if (tag === 'br' || tag === 'hr') return '<' + tag + '>';

    if (inline) {
      if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
        return inner + '<br><br>';
      }
      if (/^h[1-6]$/.test(tag)) return '<strong>' + inner + '</strong><br>';
      if (tag === 'blockquote') return inner + '<br>';
      if (tag === 'li') return '• ' + inner + '<br>';
      if (tag === 'ul' || tag === 'ol') return inner;
    }

    return '<' + tag + '>' + inner + '</' + tag + '>';
  }

  function fragmentToHtml(fragment, inline) {
    let html = '';
    for (const node of fragment.childNodes) html += nodeToHtml(node, false, inline);
    if (inline) html = html.replace(/(?:<br>)+$/, '');
    return html;
  }

  function replaceInEditable(el, range, markdown) {
    if (!el || !el.isConnected) return false;

    const plain = markdownToPlain(markdown);
    const fragment = renderMarkdown(markdown);
    const formatted = !!fragment.querySelector(
      'strong, em, ul, ol, li, h1, h2, h3, h4, h5, h6, blockquote, pre, code'
    );
    const hasBlock = !!fragment.querySelector(
      'ul, ol, li, pre, blockquote, h1, h2, h3, h4, h5, h6'
    );

    try {
      el.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }

    const selection = window.getSelection();
    if (!selection) return false;

    if (range && el.contains(range.commonAncestorContainer)) {
      try {
        selection.removeAllRanges();
        selection.addRange(range);
      } catch {
        /* stale range */
      }
    }

    let ok = false;

    if (formatted) {
      try {
        ok = document.execCommand('insertHTML', false, fragmentToHtml(fragment, !hasBlock));
      } catch {
        ok = false;
      }
    }

    if (!ok) {
      try {
        ok = document.execCommand('insertText', false, plain);
      } catch {
        ok = false;
      }
    }

    if (!ok) {
      let target = selection.rangeCount ? selection.getRangeAt(0) : null;
      if (!target || !el.contains(target.commonAncestorContainer)) {
        target = document.createRange();
        target.selectNodeContents(el);
      }
      target.deleteContents();
      const node = document.createTextNode(plain);
      target.insertNode(node);
      target.setStartAfter(node);
      target.collapse(true);
      selection.removeAllRanges();
      selection.addRange(target);
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }

    return true;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fallback below */
    }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.documentElement.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ toast

  function toast(message) {
    const u = ensureUI();
    u.toast.textContent = message;
    u.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      u.toast.hidden = true;
    }, 2400);
  }

  // ---------------------------------------------------------- page extraction

  function textOf(node) {
    const parts = [];
    const BLOCK = /^(P|DIV|SECTION|ARTICLE|LI|H[1-6]|BLOCKQUOTE|PRE|TR|DD|DT|FIGCAPTION|TABLE|UL|OL)$/;

    const walk = (n) => {
      if (n.nodeType === 3) {
        parts.push(n.nodeValue.replace(/\s+/g, ' '));
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === 'BR') {
        parts.push('\n');
        return;
      }
      if (BLOCK.test(tag)) parts.push('\n');
      if (tag === 'LI') parts.push('- ');
      for (const child of n.childNodes) walk(child);
      if (BLOCK.test(tag)) parts.push('\n');
    };

    walk(node);
    return parts
      .join('')
      .replace(/[ \t\u00a0]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function extractPage() {
    const title = (
      (document.querySelector('h1') && document.querySelector('h1').innerText) ||
      document.title ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);

    let clone;
    try {
      clone = document.documentElement.cloneNode(true);
    } catch {
      return { title, url: location.href, text: '' };
    }

    clone
      .querySelectorAll(
        'script,style,noscript,template,iframe,object,embed,svg,canvas,video,audio,nav,header,footer,aside,form,button,input,select,textarea,[data-lili],[aria-hidden="true"],[hidden],[role="navigation"],[role="banner"],[role="contentinfo"],[role="complementary"],[role="search"],[role="dialog"],[role="alertdialog"]'
      )
      .forEach((n) => n.remove());

    clone
      .querySelectorAll(
        '[class*="cookie"],[id*="cookie"],[class*="newsletter"],[class*="sidebar"],[class*="share-"],[class*="social"],[class*="related"]'
      )
      .forEach((n) => n.remove());

    const bodyText = clone.body ? textOf(clone.body) : '';
    let text = '';

    const articles = Array.from(clone.querySelectorAll('article'));
    const articleTexts = articles.map((a) => textOf(a)).filter((t) => t.length > 200);

    if (articleTexts.length === 1) {
      text = articleTexts[0];
    } else if (articleTexts.length > 1) {
      text = articleTexts.join('\n\n---\n\n');
    } else {
      const main = clone.querySelector('main, [role="main"]');
      if (main) {
        const mainText = textOf(main);
        if (mainText.length >= 400) text = mainText;
      }
    }

    if (text.length < 400) text = bodyText;

    if (text.length < bodyText.length * 0.5 && bodyText.length > 0) {
      text = bodyText;
    }

    return { title, url: location.href, text: text.slice(0, 200000) };
  }

  // Fallback for when the browser does not deliver the command shortcut.
  const SHORTCUT_ACTIONS = {
    KeyY: 'translate',
    KeyU: 'rephrase',
    KeyH: 'summarize',
    KeyE: 'summarize_page',
  };

  let pendingShortcut = null;
  let lastShortcutRun = { action: '', at: 0 };

  function shortcutFor(event) {
    if (event.defaultPrevented || event.repeat || event.altKey) return '';
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return '';
    return SHORTCUT_ACTIONS[event.code] || '';
  }

  function runShortcut(action) {
    if (!action) return;

    const now = Date.now();
    if (lastShortcutRun.action === action && now - lastShortcutRun.at < 600) return;
    lastShortcutRun = { action, at: now };

    const request = buildRequest(action, {});
    if (request) runRequest(request);
    else if (action !== 'summarize_page') toast(t('toast_select_text'));
  }

  function scheduleShortcut(action) {
    const now = Date.now();
    if (lastShortcutRun.action === action && now - lastShortcutRun.at < 600) return;

    if (pendingShortcut) clearTimeout(pendingShortcut.timer);
    pendingShortcut = {
      action,
      timer: setTimeout(() => {
        pendingShortcut = null;
        runShortcut(action);
      }, 120),
    };
  }

  function cancelPendingShortcut(action) {
    if (pendingShortcut && pendingShortcut.action === action) {
      clearTimeout(pendingShortcut.timer);
      pendingShortcut = null;
    }
  }

  document.addEventListener(
    'keydown',
    (event) => {
      if (insideUI(event)) return;
      const action = shortcutFor(event);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      scheduleShortcut(action);
    },
    true
  );

  // ---------------------------------------------------------------- listeners

  function scheduleCapture() {
    setTimeout(() => {
      const selection = readSelection();
      if (selection && selection.text.trim().length >= MIN_SELECTION) {
        sel = selection;
        showBar(selection);
      } else if (!selection) {
        hideBar();
      }
    }, 0);
  }

  document.addEventListener(
    'mouseup',
    (event) => {
      if (insideUI(event)) return;
      scheduleCapture();
    },
    true
  );

  document.addEventListener(
    'keyup',
    (event) => {
      if (insideUI(event)) return;
      if (event.shiftKey || event.key === 'a' || event.key === 'A') scheduleCapture();
    },
    true
  );

  document.addEventListener(
    'mousedown',
    (event) => {
      if (!insideUI(event)) hideBar();
    },
    true
  );

  document.addEventListener(
    'scroll',
    () => {
      hideBar();
    },
    { capture: true, passive: true }
  );

  window.addEventListener(
    'resize',
    () => {
      hideBar();
    },
    { passive: true }
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      if (ui && !ui.panel.hidden) {
        closePanel();
        return;
      }
      hideBar();
    },
    true
  );

  // -------------------------------------------------------- incoming messages

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'lili:ping') {
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'lili:get-selection') {
      const selection = readSelection();
      sendResponse({
        text: selection ? selection.text : '',
        editable: !!(selection && (selection.kind === 'input' || selection.kind === 'contenteditable')),
      });
      return;
    }

    if (message.type === 'lili:run') {
      const action = message.action;
      if (!ACTIONS[action]) {
        sendResponse({ ok: false, error: t('error_unknown_action', [action]) });
        return;
      }

      cancelPendingShortcut(action);

      const now = Date.now();
      if (lastShortcutRun.action === action && now - lastShortcutRun.at < 600) {
        sendResponse({ ok: true, duplicate: true });
        return;
      }
      lastShortcutRun = { action, at: now };

      if (message.text && String(message.text).trim()) {
        const text = String(message.text);
        runRequest({
          action,
          text,
          page: action === 'summarize_page' ? extractPage() : null,
          context: { title: document.title, url: location.href },
          selection: { kind: 'text', text, rect: null },
          anchor: null,
        });
      } else {
        const request = buildRequest(action, {});
        if (request) runRequest(request);
        else if (action !== 'summarize_page') {
          toast(t('toast_select_or_paste'));
        }
      }

      sendResponse({ ok: true });
      return;
    }
  });

  // Refresh the bar when settings change.
  try {
    api.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) loadSettings();
    });
  } catch {
    /* ignore */
  }

  loadSettings();
})();
