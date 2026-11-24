// Options page: connections, per-task routing, behaviour.
(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const LILI = globalThis.LILI || { ACTIONS: {}, SELECTION_ACTIONS: [] };

  const TASKS = [
    'translate',
    'rephrase_translate',
    'rephrase',
    'fix',
    'summarize',
    'summarize_page',
    'refine',
  ];

  const PRESETS = [
    {
      id: 'openai',
      label: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      type: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4o-mini',
    },
    {
      id: 'ovh',
      label: 'OVHcloud AI Endpoints',
      type: 'openai',
      baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
      model: 'Olala-v1.0-mini-7A1B',
    },
    {
      id: 'zen',
      label: 'OpenCode Zen',
      type: 'openai',
      baseUrl: 'https://opencode.ai/zen/v1',
      model: 'deepseek-v4-flash',
    },
    {
      id: 'go',
      label: 'OpenCode Go',
      type: 'openai',
      baseUrl: 'https://opencode.ai/inference/go/openai/v1',
      model: 'kimi-k3',
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-3-5-haiku-latest',
    },
    {
      id: 'ollama',
      label: 'Ollama (local)',
      type: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.1:8b',
    },
    {
      id: 'custom',
      label: 'Personnalisé (OpenAI-compatible)',
      type: 'openai',
      baseUrl: '',
      model: '',
    },
  ];

  const TYPE_LABELS = { openai: 'OpenAI-compatible', anthropic: 'Anthropic', ollama: 'Ollama' };

  const $ = (selector) => document.querySelector(selector);
  const send = (message) => api.runtime.sendMessage(message);

  const state = {
    connections: [],
    fallback: { connection: '', model: '' },
    routing: {},
    language: { translateTarget: 'auto', output: 'fr' },
    rephrase: { tone: 'neutre' },
    summary: { length: 'moyen' },
    limits: { maxSelectionChars: 20000, maxPageChars: 120000 },
    ui: { toolbar: true, autoReplace: false, actions: [] },
  };

  const modelCache = {};

  // ------------------------------------------------------------------ helpers

  function setStatus(text, kind) {
    const element = $('#status');
    element.textContent = text || '';
    element.className = 'status' + (kind ? ' ' + kind : '');
  }

  function typeLabel(type) {
    return TYPE_LABELS[type] || type || 'OpenAI-compatible';
  }

  function originOf(url) {
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  }

  /** Ask for host access; must stay the first await in a click handler. */
  async function ensurePermissions(origins) {
    const unique = [...new Set((origins || []).filter(Boolean))];
    if (!unique.length) return { ok: true };
    if (!api.permissions || !api.permissions.request) return { ok: true, skipped: true };

    try {
      const granted = await api.permissions.request({
        origins: unique.map((origin) => origin + '/*'),
      });
      return { ok: !!granted };
    } catch (error) {
      return { ok: false, error: (error && error.message) || String(error) };
    }
  }

  function uniqueId(base) {
    let id = base || 'connexion';
    let index = 2;
    while (state.connections.some((connection) => connection.id === id)) {
      id = base + '-' + index++;
    }
    return id;
  }

  function cardMessage(card, text, isError) {
    const element = card.querySelector('.conn-msg');
    element.hidden = !text;
    element.textContent = text || '';
    element.classList.toggle('err', !!isError);
  }

  // -------------------------------------------------------------- form state

  function renderActions(selected) {
    const chosen = new Set(Array.isArray(selected) ? selected : LILI.SELECTION_ACTIONS);
    const box = $('#actions');
    box.textContent = '';

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
      box.appendChild(label);
    }
  }

  function fillStaticForm() {
    $('#translateTarget').value = state.language.translateTarget || 'auto';
    $('#output').value = state.language.output || 'fr';
    $('#tone').value = state.rephrase.tone || 'neutre';
    $('#length').value = state.summary.length || 'moyen';
    $('#maxSelectionChars').value = state.limits.maxSelectionChars || 20000;
    $('#maxPageChars').value = state.limits.maxPageChars || 120000;
    $('#toolbar').checked = state.ui.toolbar !== false;
    $('#autoReplace').checked = !!state.ui.autoReplace;
    $('#directMode').checked = !!state.ui.directMode;
    $('#context').checked = !!state.ui.context;
    renderActions(state.ui.actions);
  }

  function collectStatic() {
    const actions = Array.from($('#actions').querySelectorAll('input[type="checkbox"]'))
      .filter((input) => input.checked)
      .map((input) => input.value);

    state.language = {
      translateTarget: $('#translateTarget').value,
      output: $('#output').value,
    };
    state.rephrase = { tone: $('#tone').value };
    state.summary = { length: $('#length').value };
    state.limits = {
      ...state.limits,
      maxSelectionChars: Number($('#maxSelectionChars').value) || 20000,
      maxPageChars: Number($('#maxPageChars').value) || 120000,
    };
    state.ui = {
      ...state.ui,
      toolbar: $('#toolbar').checked,
      autoReplace: $('#autoReplace').checked,
      directMode: $('#directMode').checked,
      context: $('#context').checked,
      actions: actions.length ? actions : LILI.SELECTION_ACTIONS,
    };
  }

  function serialize() {
    return {
      connections: state.connections.map((connection) => ({
        id: connection.id,
        label: connection.label || connection.id,
        type: connection.type || 'openai',
        baseUrl: connection.baseUrl || '',
        apiKey: connection.apiKey || '',
        model: connection.model || '',
      })),
      fallback: {
        connection: state.fallback.connection || '',
        model: state.fallback.model || '',
      },
      routing: Object.fromEntries(
        TASKS.map((id) => [
          id,
          {
            connection: (state.routing[id] && state.routing[id].connection) || '',
            model: (state.routing[id] && state.routing[id].model) || '',
          },
        ])
      ),
      language: state.language,
      rephrase: state.rephrase,
      summary: state.summary,
      limits: state.limits,
      ui: state.ui,
    };
  }

  // ---------------------------------------------------------------- pickers

  const pickers = [];

  function createModelPicker(options) {
    const wrap = document.createElement('div');
    wrap.className = 'picker';

    const select = document.createElement('select');
    const input = document.createElement('input');
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    wrap.append(select, input);

    const picker = {
      element: wrap,
      select,
      input,
      models: [],
      value: options.value || '',
      custom: false,
      emptyLabel: options.emptyLabel || '— défaut —',
      kind: options.kind || 'route',
      placeholder: 'modèle',
      getConnection: options.getConnection || (() => null),
      onChange: options.onChange || (() => {}),
    };

    function render() {
      if (!picker.models.length) {
        select.hidden = true;
        input.hidden = false;
        input.placeholder = picker.placeholder;
        if (input.value !== picker.value) input.value = picker.value;
        return;
      }

      select.hidden = false;
      select.textContent = '';

      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = picker.emptyLabel;
      select.appendChild(empty);

      for (const model of picker.models) {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        select.appendChild(option);
      }

      if (picker.value && !picker.models.includes(picker.value)) {
        const option = document.createElement('option');
        option.value = picker.value;
        option.textContent = picker.value + ' · personnalisé';
        select.appendChild(option);
      }

      const custom = document.createElement('option');
      custom.value = '__custom__';
      custom.textContent = 'Autre modèle…';
      select.appendChild(custom);

      if (picker.custom) {
        select.value = '__custom__';
        input.hidden = false;
        input.placeholder = picker.placeholder;
        if (input.value !== picker.value) input.value = picker.value;
      } else {
        select.value = picker.value;
        input.hidden = true;
      }
    }

    select.addEventListener('change', () => {
      if (select.value === '__custom__') {
        picker.custom = true;
        input.hidden = false;
        input.value = picker.value;
        input.focus();
        return;
      }
      picker.custom = false;
      picker.value = select.value;
      input.value = picker.value;
      picker.onChange(picker.value);
    });

    input.addEventListener('input', () => {
      picker.value = input.value.trim();
      picker.onChange(picker.value);
    });

    input.addEventListener('blur', () => {
      if (picker.custom && !picker.value && picker.models.length) {
        picker.custom = false;
        render();
      }
    });

    picker.render = render;
    pickers.push(picker);
    render();
    return picker;
  }

  function refreshPickers() {
    for (const picker of pickers) {
      const connection = picker.getConnection();
      picker.models = connection ? modelCache[connection.id] || [] : [];
      picker.placeholder = connection && connection.model ? connection.model + ' (défaut)' : 'modèle';
      if (picker.kind === 'route') {
        picker.emptyLabel =
          connection && connection.model ? 'Défaut : ' + connection.model : '— défaut —';
      }
      picker.render();
    }
  }

  function updateCounts() {
    for (const card of document.querySelectorAll('#connections .conn')) {
      const count = card.querySelector('.conn-count');
      if (!count) continue;
      const models = modelCache[card.dataset.id] || [];
      count.textContent = models.length ? models.length + ' modèles' : '';
    }
  }

  // --------------------------------------------------------------- rendering

  function buildConnection(connection) {
    const template = $('#connection-template');
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector('.conn');
    const title = fragment.querySelector('.conn-title');
    const badge = fragment.querySelector('.conn-badge');

    card.dataset.id = connection.id;
    title.textContent = connection.label || connection.id;
    badge.textContent = typeLabel(connection.type);

    for (const name of ['label', 'type', 'baseUrl', 'apiKey']) {
      const input = fragment.querySelector('[data-field="' + name + '"]');
      input.value = connection[name] || '';

      input.addEventListener('input', () => {
        connection[name] = input.value;
        if (name === 'label') title.textContent = input.value || connection.id;
        if (name === 'type') badge.textContent = typeLabel(input.value);
        if (name === 'type' || name === 'baseUrl') {
          delete modelCache[connection.id];
          refreshPickers();
          updateCounts();
        }
      });
    }

    const slot = fragment.querySelector('[data-field="model"]');
    const picker = createModelPicker({
      value: connection.model,
      emptyLabel: '— aucun —',
      kind: 'connection',
      getConnection: () => connection,
      onChange: (value) => {
        connection.model = value;
        refreshPickers();
      },
    });
    slot.appendChild(picker.element);

    return card;
  }

  function renderConnections() {
    const box = $('#connections');
    box.textContent = '';

    if (!state.connections.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Aucune connexion. Ajoute-en une avec le menu ci-dessous.';
      box.appendChild(empty);
      return;
    }

    for (const connection of state.connections) {
      box.appendChild(buildConnection(connection));
    }
  }

  function buildRoute(id, label, route, isFallback) {
    const template = $('#route-template');
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('.route');
    const select = fragment.querySelector('[data-route="connection"]');

    row.querySelector('.route-name').textContent = label;

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = isFallback ? 'Première connexion' : 'Par défaut';
    select.appendChild(emptyOption);

    for (const connection of state.connections) {
      const option = document.createElement('option');
      option.value = connection.id;
      option.textContent = connection.label || connection.id;
      select.appendChild(option);
    }

    select.value = state.connections.some((c) => c.id === route.connection) ? route.connection : '';

    const effectiveConnection = () =>
      state.connections.find((c) => c.id === select.value) ||
      state.connections.find((c) => c.id === state.fallback.connection) ||
      state.connections[0] ||
      null;

    const picker = createModelPicker({
      value: route.model,
      emptyLabel: '— défaut —',
      getConnection: effectiveConnection,
      onChange: (value) => {
        route.model = value;
      },
    });
    fragment.querySelector('[data-route="model"]').appendChild(picker.element);

    select.addEventListener('change', () => {
      route.connection = select.value;
      refreshPickers();
    });

    return row;
  }

  function renderRoutes() {
    const box = $('#routes');
    box.textContent = '';

    const header = document.createElement('div');
    header.className = 'route route-head';
    for (const text of ['Tâche', 'Connexion', 'Modèle']) {
      const cell = document.createElement('span');
      cell.textContent = text;
      header.appendChild(cell);
    }
    box.appendChild(header);

    box.appendChild(buildRoute('__fallback__', 'Par défaut', state.fallback, true));

    for (const id of TASKS) {
      if (!state.routing[id]) state.routing[id] = { connection: '', model: '' };
      const meta = LILI.ACTIONS[id];
      box.appendChild(buildRoute(id, (meta && meta.label) || id, state.routing[id], false));
    }
  }

  function renderAll() {
    pickers.length = 0;
    renderConnections();
    renderRoutes();
    refreshPickers();
    updateCounts();
  }

  // ---------------------------------------------------------------- actions

  function addPreset() {
    const preset = PRESETS.find((item) => item.id === $('#preset').value) || PRESETS[0];
    collectStatic();

    state.connections.push({
      id: uniqueId(preset.id),
      label: preset.label,
      type: preset.type,
      baseUrl: preset.baseUrl,
      apiKey: '',
      model: preset.model,
    });

    renderAll();
    const status = $('#connections-status');
    status.hidden = false;
    status.textContent = preset.label + ' ajouté. Renseigne la clé API puis enregistre.';
  }

  function removeConnection(id) {
    const connection = state.connections.find((item) => item.id === id);
    if (!connection) return;
    if (!confirm('Supprimer la connexion « ' + (connection.label || id) + ' » ?')) return;

    collectStatic();
    state.connections = state.connections.filter((item) => item.id !== id);

    if (state.fallback.connection === id) state.fallback.connection = '';
    for (const task of TASKS) {
      if (state.routing[task] && state.routing[task].connection === id) {
        state.routing[task].connection = '';
      }
    }

    delete modelCache[id];
    renderAll();
  }

  async function testConnection(connection, card) {
    const permission = await ensurePermissions([originOf(connection.baseUrl)]);
    if (!permission.ok) {
      cardMessage(card, 'Accès réseau refusé pour cet hôte.', true);
      return;
    }

    cardMessage(card, 'Test en cours…');
    try {
      const response = await send({ type: 'lili:test', connection });
      if (response && response.ok) {
        cardMessage(card, 'Connexion OK en ' + response.ms + ' ms — « ' + response.text + ' »');
      } else {
        cardMessage(card, (response && response.error) || 'Échec du test.', true);
      }
    } catch (error) {
      cardMessage(card, 'Échec : ' + ((error && error.message) || error), true);
    }
  }

  async function loadModels(connection, card) {
    const permission = await ensurePermissions([originOf(connection.baseUrl)]);
    if (!permission.ok) {
      cardMessage(card, 'Accès réseau refusé pour cet hôte.', true);
      return;
    }

    cardMessage(card, 'Chargement des modèles…');
    try {
      const response = await send({ type: 'lili:list-models', connection, refresh: true });
      if (response && response.ok) {
        modelCache[connection.id] = response.models || [];
        refreshPickers();
        updateCounts();
        cardMessage(card, modelCache[connection.id].length + ' modèles chargés.');
      } else {
        cardMessage(
          card,
          (response && response.error) ||
            'Aucune réponse du service d’arrière-plan : recharge l’extension puis réessaie.',
          true
        );
      }
    } catch (error) {
      cardMessage(card, 'Échec : ' + ((error && error.message) || error), true);
    }
  }

  /** Prefetch model lists in the background; failures stay silent. */
  async function autoLoadModels() {
    const targets = state.connections.filter((connection) => connection.baseUrl);
    if (!targets.length) return;

    await Promise.all(
      targets.map(async (connection) => {
        try {
          const response = await send({ type: 'lili:list-models', connection });
          if (response && response.ok) modelCache[connection.id] = response.models || [];
        } catch {
          /* no host permission yet: the refresh button will ask for it */
        }
      })
    );

    refreshPickers();
    updateCounts();
  }

  async function save() {
    collectStatic();

    const origins = state.connections
      .map((connection) => originOf(connection.baseUrl))
      .filter(Boolean);

    const permission = await ensurePermissions(origins);
    setStatus('Enregistrement…');

    let response;
    try {
      response = await send({ type: 'lili:save-settings', settings: serialize() });
    } catch (error) {
      setStatus('Erreur : ' + ((error && error.message) || error), 'err');
      return;
    }

    if (!response || !response.ok) {
      setStatus('Erreur : ' + ((response && response.error) || 'enregistrement impossible'), 'err');
      return;
    }

    load(response.settings);

    if (permission.ok) {
      setStatus('Réglages enregistrés.', 'ok');
    } else {
      setStatus(
        'Réglages enregistrés, mais l’accès réseau à un hôte est refusé' +
          (permission.error ? ' (' + permission.error + ')' : '') +
          '. L’API doit alors autoriser CORS.',
        'err'
      );
    }
  }

  async function reset() {
    if (!confirm('Rétablir tous les réglages par défaut (clés API comprises) ?')) return;
    setStatus('Réinitialisation…');

    const response = await send({ type: 'lili:reset-settings' });
    if (response && response.ok) {
      load(response.settings);
      setStatus('Réglages réinitialisés.', 'ok');
    } else {
      setStatus('Réinitialisation impossible.', 'err');
    }
  }

  // ------------------------------------------------------------------ events

  function onConnectionsClick(event) {
    const button = event.target.closest('button[data-act]');
    if (!button) return;

    const card = button.closest('.conn');
    const connection = state.connections.find((item) => item.id === card.dataset.id);
    if (!connection) return;

    const action = button.dataset.act;

    if (action === 'reveal') {
      const input = card.querySelector('[data-field="apiKey"]');
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.textContent = reveal ? 'Masquer' : 'Afficher';
    } else if (action === 'test') {
      testConnection(connection, card);
    } else if (action === 'models') {
      loadModels(connection, card);
    } else if (action === 'remove') {
      removeConnection(connection.id);
    }
  }

  function populatePresets() {
    const select = $('#preset');
    for (const preset of PRESETS) {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.label;
      select.appendChild(option);
    }
  }

  function load(settings) {
    state.connections = (settings.connections || []).map((connection, index) => ({
      id: connection.id || 'connection-' + (index + 1),
      label: connection.label || connection.id || 'Connexion',
      type: connection.type || 'openai',
      baseUrl: connection.baseUrl || '',
      apiKey: connection.apiKey || '',
      model: connection.model || '',
    }));

    state.fallback = {
      connection: (settings.fallback && settings.fallback.connection) || '',
      model: (settings.fallback && settings.fallback.model) || '',
    };

    state.routing = {};
    for (const id of TASKS) {
      const route = (settings.routing && settings.routing[id]) || {};
      state.routing[id] = { connection: route.connection || '', model: route.model || '' };
    }

    state.language = { ...state.language, ...(settings.language || {}) };
    state.rephrase = { ...state.rephrase, ...(settings.rephrase || {}) };
    state.summary = { ...state.summary, ...(settings.summary || {}) };
    state.limits = { ...state.limits, ...(settings.limits || {}) };
    state.ui = { ...state.ui, ...(settings.ui || {}) };

    fillStaticForm();
    renderAll();
    autoLoadModels();
  }

  $('#save').addEventListener('click', save);
  $('#reset').addEventListener('click', reset);
  $('#add-connection').addEventListener('click', addPreset);
  $('#connections').addEventListener('click', onConnectionsClick);

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });

  (async () => {
    const version = document.querySelector('.version');
    try {
      version.textContent = 'v' + api.runtime.getManifest().version;
    } catch {
      /* ignore */
    }

    populatePresets();

    try {
      const settings = await send({ type: 'lili:get-settings' });
      if (settings) load(settings);
    } catch (error) {
      setStatus('Impossible de charger les réglages : ' + ((error && error.message) || error), 'err');
    }
  })();
})();
