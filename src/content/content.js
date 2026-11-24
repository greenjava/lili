// Content script: captures the selection, shows the floating bar and result panel,
// and replaces text inside editable fields.
(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  if (!api || !api.runtime || !api.runtime.id) return;
  if (window.__liliReady) return;
  window.__liliReady = true;

  const LILI = globalThis.LILI || {};
  const ACTIONS = LILI.ACTIONS || {};
  const REPLACEABLE = new Set(LILI.REPLACEABLE || []);
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
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
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
      'aria-label': 'Actions Lili',
      hidden: '',
    });

    const title = node('span', { class: 'lili-title', text: 'Résultat' });
    const meta = node('span', { class: 'lili-meta' });

    const settingsBtn = node('button', {
      type: 'button',
      class: 'lili-iconbtn',
      'data-ui': 'settings',
      title: 'Réglages',
      'aria-label': 'Réglages',
    });
    settingsBtn.appendChild(iconNode('settings'));

    const closeBtn = node('button', {
      type: 'button',
      class: 'lili-iconbtn',
      'data-ui': 'close',
      title: 'Fermer (Échap)',
      'aria-label': 'Fermer',
    });
    closeBtn.appendChild(iconNode('close'));

    const head = node('div', { class: 'lili-head' }, [title, meta, settingsBtn, closeBtn]);

    const text = node('div', { class: 'lili-text' });
    const error = node('div', { class: 'lili-error', hidden: '' });
    const statusText = node('span', { class: 'lili-status-text' });
    const status = node('div', { class: 'lili-status', hidden: '' }, [
      node('span', { class: 'lili-spinner' }),
      statusText,
    ]);
    const body = node('div', { class: 'lili-body' }, [text, error, status]);

    const replaceBtn = actionButton('replace', 'replace', 'Remplacer', true);
    replaceBtn.hidden = true;
    replaceBtn.disabled = true;

    const copyBtn = actionButton('copy', 'copy', 'Copier');
    copyBtn.disabled = true;

    const retryBtn = actionButton('retry', 'retry', 'Relancer');
    retryBtn.disabled = true;

    const footerClose = actionButton('close', 'close', 'Fermer');

    const foot = node('div', { class: 'lili-foot' }, [
      replaceBtn,
      copyBtn,
      retryBtn,
      node('span', { class: 'lili-kbd', text: 'Échap' }),
      footerClose,
    ]);

    const panel = node(
      'div',
      { class: 'lili-panel', role: 'dialog', 'aria-label': 'Résultat Lili', hidden: '' },
      [head, body, foot]
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
    };
  }

  let ui = null;
  let settings = null;
  let sel = null;
  let job = null;
  let lastRequest = null;
  let toastTimer = null;

  // ----------------------------------------------------------------- settings

  async function loadSettings() {
    try {
      settings = await api.runtime.sendMessage({ type: 'lili:get-settings' });
    } catch {
      settings = null;
    }
    if (ui) renderBar();
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
      toast: parts.toast,
    };

    ui.textNode = document.createTextNode('');
    ui.text.appendChild(ui.textNode);

    shadow.addEventListener('click', onClick);
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
      title: action.hint || action.label,
      'aria-label': action.label,
    });
    button.appendChild(iconNode(action.icon));
    button.appendChild(node('span', { class: 'lili-lbl', text: action.short || action.label }));
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

  function readSelection() {
    const active = document.activeElement;
    if (isTextField(active)) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (typeof start === 'number' && typeof end === 'number' && end > start) {
        const text = active.value.slice(start, end);
        if (text && text.trim().length >= 1) {
          const rect = active.getBoundingClientRect();
          return {
            kind: 'input',
            el: active,
            start,
            end,
            text,
            rect: rect && rect.height ? rect : null,
          };
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
    return {
      kind: editable ? 'contenteditable' : 'text',
      el: editable,
      range: range.cloneRange(),
      text,
      rect: rect || null,
    };
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

  function showBar(selection) {
    ensureUI();
    if (settings && settings.ui && settings.ui.toolbar === false) return;
    if (!selection || !selection.rect) return;
    ui.bar.hidden = false;
    placeBar(selection.rect);
  }

  function hideBar() {
    if (ui) ui.bar.hidden = true;
  }

  // ------------------------------------------------------------------- panel

  function setStatus(text) {
    if (!ui) return;
    if (!text) {
      ui.status.hidden = true;
      return;
    }
    ui.status.hidden = false;
    ui.statusText.textContent = text;
  }

  function resetPanel(action, anchor) {
    ui.title.textContent = (ACTIONS[action] && ACTIONS[action].label) || action;
    ui.meta.textContent = '';
    ui.meta.title = '';
    delete ui.meta.dataset.direction;
    ui.textNode.data = '';
    ui.error.hidden = true;
    ui.error.textContent = '';
    ui.replaceBtn.hidden = true;
    ui.replaceBtn.disabled = true;
    ui.copyBtn.disabled = true;
    ui.retryBtn.disabled = true;
    ui.panel.classList.add('is-streaming');
    ui.body.scrollTop = 0;
    job = { action, text: '', stick: true };
    ui.panel.hidden = false;
    setStatus('Envoi de la demande…');
    placePanel(anchor);
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

  function finishJob(info) {
    if (!ui || !job) return;
    job.finished = true;
    ui.panel.classList.remove('is-streaming');
    setStatus('');
    ui.copyBtn.disabled = !job.text.trim();
    ui.retryBtn.disabled = !lastRequest;

    if (info && info.model) {
      const direction = ui.meta.dataset.direction || '';
      const label = [direction, info.model].filter(Boolean).join(' · ');
      ui.meta.textContent = label;
      ui.meta.title = [info.provider, info.model].filter(Boolean).join(' / ');
    }

    const canReplace = lastRequest && isReplaceable(lastRequest.selection);
    ui.replaceBtn.hidden = !canReplace;
    ui.replaceBtn.disabled = !canReplace || !job.text.trim();

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
        toast('Texte remplacé. Ctrl+Z pour annuler.');
      }
    }
  }

  function failJob(message) {
    if (!ui || !job) return;
    job.finished = true;
    ui.panel.classList.remove('is-streaming');
    setStatus('');
    ui.error.hidden = false;
    ui.error.textContent = message;
    ui.retryBtn.disabled = !lastRequest;
    ui.copyBtn.disabled = !job.text.trim();
  }

  function closePanel() {
    if (!ui) return;
    abortJob();
    ui.panel.hidden = true;
    ui.error.hidden = true;
    ui.textNode.data = '';
    setStatus('');
    job = null;
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
      text: isPage ? '' : selection.text,
      page: isPage ? extractPage() : null,
      context: { title: document.title, url: location.href },
      selection: selection || null,
      anchor: selection && selection.rect ? selection.rect : null,
    };
  }

  function runRequest(request) {
    if (!request) return;
    ensureUI();
    hideBar();

    const anchor = request.action === 'summarize_page' ? null : request.anchor;
    resetPanel(request.action, anchor);
    lastRequest = request;

    if (request.action === 'summarize_page' && (!request.page || request.page.text.length < 150)) {
      failJob(
        'Cette page ne semble pas contenir assez de texte à résumer (article, blog, documentation…).'
      );
      return;
    }

    let port;
    try {
      port = api.runtime.connect({ name: 'lili-stream' });
    } catch (error) {
      failJob('Impossible de joindre l’extension : ' + (error && error.message ? error.message : ''));
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
          (err && err.message) ||
            'Connexion interrompue avant la fin de la réponse. Réessaie ou vérifie les réglages.'
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
      });
    } catch (error) {
      failJob('Envoi impossible : ' + (error && error.message ? error.message : ''));
    }
  }

  function onClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const actionBtn = target.closest('[data-action]');
    if (actionBtn) {
      event.preventDefault();
      event.stopPropagation();
      const action = actionBtn.getAttribute('data-action');
      const request = buildRequest(action, {});
      if (!request) {
        toast('Sélectionne d’abord du texte.');
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
    const ok = await copyText(job.text.trim());
    toast(ok ? 'Copié dans le presse-papiers.' : 'Copie impossible.');
  }

  function doReplace() {
    if (!job || !lastRequest || !job.text.trim()) return;
    const ok = replaceSelection(lastRequest.selection, job.text.trim());
    if (ok) {
      closePanel();
      toast('Texte remplacé. Ctrl+Z pour annuler.');
    } else {
      toast('Remplacement impossible : le champ a peut-être changé.');
    }
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
      return replaceInField(selection.el, selection.start, selection.end, text);
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

  function replaceInEditable(el, range, text) {
    if (!el || !el.isConnected) return false;

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
    try {
      ok = document.execCommand('insertText', false, text);
    } catch {
      ok = false;
    }

    if (!ok) {
      let target = selection.rangeCount ? selection.getRangeAt(0) : null;
      if (!target || !el.contains(target.commonAncestorContainer)) {
        target = document.createRange();
        target.selectNodeContents(el);
      }
      target.deleteContents();
      const node = document.createTextNode(text);
      target.insertNode(node);
      target.setStartAfter(node);
      target.collapse(true);
      selection.removeAllRanges();
      selection.addRange(target);
      el.dispatchEvent(
        new Event('input', { bubbles: true, composed: true })
      );
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
        sendResponse({ ok: false, error: 'Action inconnue : ' + action });
        return;
      }

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
          toast('Sélectionne d’abord du texte, ou colle-le dans le popup.');
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
