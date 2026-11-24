// Options page.
(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const LILI = globalThis.LILI || { ACTIONS: {}, SELECTION_ACTIONS: [] };
  const PROVIDERS = ['openai', 'anthropic', 'ollama'];

  const $ = (selector) => document.querySelector(selector);

  const providerSelect = $('#provider');
  const actionsBox = $('#actions');
  const statusEl = $('#status');
  const testResult = $('#test-result');

  let current = null;

  const send = (message) => api.runtime.sendMessage(message);

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? '' : value;
  }

  function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function toggleProviderBlocks() {
    for (const block of document.querySelectorAll('.provider')) {
      block.hidden = block.getAttribute('data-provider') !== providerSelect.value;
    }
  }

  function renderActions(selected) {
    const chosen = new Set(Array.isArray(selected) ? selected : LILI.SELECTION_ACTIONS);
    actionsBox.textContent = '';

    for (const id of LILI.SELECTION_ACTIONS || []) {
      const meta = LILI.ACTIONS[id];
      if (!meta) continue;

      const label = document.createElement('label');
      label.className = 'check';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = id;
      input.checked = chosen.has(id);
      input.dataset.action = id;

      const span = document.createElement('span');
      span.textContent = meta.label;

      label.append(input, span);
      actionsBox.appendChild(label);
    }
  }

  function fill(settings) {
    current = settings;
    providerSelect.value = settings.provider || 'openai';

    for (const key of PROVIDERS) {
      const provider = settings.providers[key] || {};
      setValue(key + '-baseUrl', provider.baseUrl);
      setValue(key + '-apiKey', provider.apiKey);
      setValue(key + '-model', provider.model);
    }

    setValue('translateTarget', settings.language.translateTarget);
    setValue('output', settings.language.output);
    setValue('tone', settings.rephrase.tone);
    setValue('length', settings.summary.length);
    setValue('maxSelectionChars', settings.limits.maxSelectionChars);
    setValue('maxPageChars', settings.limits.maxPageChars);

    $('#toolbar').checked = settings.ui.toolbar !== false;
    $('#autoReplace').checked = !!settings.ui.autoReplace;

    renderActions(settings.ui.actions);
    toggleProviderBlocks();
  }

  function readProvider(key) {
    return {
      baseUrl: getValue(key + '-baseUrl'),
      apiKey: getValue(key + '-apiKey'),
      model: getValue(key + '-model'),
    };
  }

  function collect() {
    const actions = Array.from(actionsBox.querySelectorAll('input[type="checkbox"]'))
      .filter((input) => input.checked)
      .map((input) => input.value);

    return {
      provider: providerSelect.value,
      providers: {
        openai: readProvider('openai'),
        anthropic: readProvider('anthropic'),
        ollama: readProvider('ollama'),
      },
      language: {
        translateTarget: $('#translateTarget').value,
        output: $('#output').value,
      },
      rephrase: { tone: $('#tone').value },
      summary: { length: $('#length').value },
      limits: {
        maxSelectionChars: Number($('#maxSelectionChars').value) || 20000,
        maxPageChars: Number($('#maxPageChars').value) || 120000,
      },
      ui: {
        toolbar: $('#toolbar').checked,
        autoReplace: $('#autoReplace').checked,
        actions: actions.length ? actions : LILI.SELECTION_ACTIONS,
      },
    };
  }

  /** Request host access; must stay on the user gesture. */
  async function ensurePermission(baseUrl) {
    if (!api.permissions || !api.permissions.request) return { ok: true, skipped: true };

    let origin;
    try {
      origin = new URL(baseUrl).origin;
    } catch {
      return { ok: false, error: 'URL de base invalide.' };
    }

    try {
      const granted = await api.permissions.request({ origins: [origin + '/*'] });
      return { ok: !!granted };
    } catch (error) {
      return { ok: false, error: (error && error.message) || String(error) };
    }
  }

  async function save() {
    const settings = collect();
    const permission = await ensurePermission(settings.providers[settings.provider].baseUrl);

    setStatus('Enregistrement…');

    let response;
    try {
      response = await send({ type: 'lili:save-settings', settings });
    } catch (error) {
      setStatus('Erreur : ' + ((error && error.message) || error), 'err');
      return;
    }

    if (!response || !response.ok) {
      setStatus('Erreur : ' + ((response && response.error) || 'enregistrement impossible'), 'err');
      return;
    }

    fill(response.settings);

    if (permission.ok) setStatus('Réglages enregistrés.', 'ok');
    else {
      setStatus(
        'Réglages enregistrés, mais l’accès réseau à cet hôte est refusé ' +
          (permission.error ? '(' + permission.error + ')' : '') +
          '. L’API doit alors autoriser CORS.',
        'err'
      );
    }
  }

  async function test() {
    const provider = providerSelect.value;
    const config = readProvider(provider);

    testResult.hidden = false;
    testResult.className = 'result';
    testResult.textContent = 'Test en cours…';

    const permission = await ensurePermission(config.baseUrl);
    if (!permission.ok) {
      testResult.className = 'result err';
      testResult.textContent =
        'Accès réseau refusé pour cet hôte' + (permission.error ? ' : ' + permission.error : '.');
      return;
    }

    $('#test').disabled = true;
    try {
      const response = await send({ type: 'lili:test', provider, config });
      if (response && response.ok) {
        testResult.className = 'result ok';
        testResult.textContent =
          'Connexion OK en ' + response.ms + ' ms — réponse : « ' + response.text + ' »';
      } else {
        testResult.className = 'result err';
        testResult.textContent = (response && response.error) || 'Échec du test.';
      }
    } catch (error) {
      testResult.className = 'result err';
      testResult.textContent = 'Échec : ' + ((error && error.message) || error);
    } finally {
      $('#test').disabled = false;
    }
  }

  async function reset() {
    if (!confirm('Rétablir tous les réglages par défaut (clés API comprises) ?')) return;
    setStatus('Réinitialisation…');
    const response = await send({ type: 'lili:reset-settings' });
    if (response && response.ok) {
      fill(response.settings);
      setStatus('Réglages réinitialisés.', 'ok');
    } else {
      setStatus('Réinitialisation impossible.', 'err');
    }
  }

  providerSelect.addEventListener('change', toggleProviderBlocks);

  for (const button of document.querySelectorAll('[data-reveal]')) {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.getAttribute('data-reveal'));
      if (!input) return;
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.textContent = reveal ? 'Masquer' : 'Afficher';
    });
  }

  $('#save').addEventListener('click', save);
  $('#test').addEventListener('click', test);
  $('#reset').addEventListener('click', reset);

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });

  (async () => {
    try {
      const settings = await send({ type: 'lili:get-settings' });
      if (settings) fill(settings);
    } catch (error) {
      setStatus('Impossible de charger les réglages : ' + ((error && error.message) || error), 'err');
    }
  })();
})();
