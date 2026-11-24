// Popup: quick actions on the current selection or pasted text.
(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const LILI = globalThis.LILI || { ACTIONS: {}, SELECTION_ACTIONS: [] };

  const $ = (selector) => document.querySelector(selector);
  const previewEl = $('#selection-preview');
  const countEl = $('#selection-count');
  const noticeEl = $('#notice');
  const textArea = $('#text');
  const pageButton = $('#page-action');

  let tabId = null;
  let selectionText = '';
  let canInject = false;
  let selectionButtons = [];
  let textButtons = [];

  function showNotice(message, isError) {
    noticeEl.textContent = message;
    noticeEl.hidden = false;
    noticeEl.className = 'notice' + (isError ? ' error' : '');
  }

  function makeButton(action, primary) {
    const meta = LILI.ACTIONS[action] || { label: action };
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = meta.label || action;
    button.title = meta.hint || meta.label;
    if (primary) button.className = 'primary';
    button.addEventListener('click', () => {
      dispatch(action, button.dataset.origin === 'text' ? textArea.value.trim() : '');
    });
    return button;
  }

  function buildActions() {
    const selectionBox = $('#selection-actions');
    const textBox = $('#text-actions');
    selectionBox.textContent = '';
    textBox.textContent = '';

    selectionButtons = (LILI.SELECTION_ACTIONS || []).map((action, index) => {
      const button = makeButton(action, index === 0);
      button.disabled = !canInject || !selectionText;
      selectionBox.appendChild(button);
      return button;
    });

    textButtons = (LILI.SELECTION_ACTIONS || []).map((action, index) => {
      const button = makeButton(action, false);
      button.dataset.origin = 'text';
      button.disabled = !canInject || !textArea.value.trim();
      textBox.appendChild(button);
      return button;
    });

    pageButton.disabled = !canInject;
  }

  function setSelection(text) {
    selectionText = text || '';
    const clean = selectionText.replace(/\s+/g, ' ').trim();
    if (clean) {
      previewEl.textContent = clean.length > 260 ? clean.slice(0, 260) + '…' : clean;
      previewEl.classList.add('has-text');
      countEl.textContent = selectionText.length + ' car.';
    } else {
      previewEl.textContent = 'Aucune sélection détectée.';
      previewEl.classList.remove('has-text');
      countEl.textContent = '';
    }
  }

  async function dispatch(action, text) {
    if (!canInject || tabId == null) {
      showNotice('Cette page ne permet pas les actions Lili.', true);
      return;
    }
    try {
      await api.tabs.sendMessage(tabId, {
        type: 'lili:run',
        action,
        text: text || undefined,
      });
      window.close();
    } catch (error) {
      showNotice(
        'Impossible d’agir sur cette page : ' +
          ((error && error.message) || 'connexion refusée') +
          '. Recharge la page et réessaie.',
        true
      );
    }
  }

  function updateTextButtons() {
    const ready = canInject && !!textArea.value.trim();
    for (const button of textButtons) button.disabled = !ready;
  }

  textArea.addEventListener('input', updateTextButtons);

  pageButton.addEventListener('click', () => dispatch('summarize_page', ''));

  $('#options').addEventListener('click', () => {
    api.runtime.openOptionsPage();
    window.close();
  });

  (async () => {
    try {
      const settings = await api.runtime.sendMessage({ type: 'lili:get-settings' });
      if (settings) {
        const fallback = settings.fallback || {};
        const connections = settings.connections || [];
        const connection =
          connections.find((item) => item.id === fallback.connection) || connections[0] || null;
        const label = (connection && (connection.label || connection.id)) || '';
        const model = (connection && connection.model) || fallback.model || '';
        $('#provider').textContent = [label, model].filter(Boolean).join(' · ') || 'Aucune connexion';
      }
    } catch {
      /* popup still works */
    }

    try {
      const tabs = await api.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      tabId = tab ? tab.id : null;
    } catch {
      tabId = null;
    }

    if (tabId == null) {
      canInject = false;
      showNotice('Aucun onglet actif détecté.', true);
    } else {
      try {
        const selection = await api.tabs.sendMessage(tabId, { type: 'lili:get-selection' });
        canInject = true;
        setSelection(selection && selection.text ? selection.text : '');
      } catch {
        canInject = false;
        showNotice(
          'Cette page n’autorise pas l’injection de l’extension (page interne, PDF, Web Store). Ouvre une page web classique.',
          true
        );
        setSelection('');
      }
    }

    buildActions();
    updateTextButtons();
  })();
})();
