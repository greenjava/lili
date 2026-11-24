// Service worker (Chrome) / event page (Firefox).
// No imports: both browsers load this file as is.

'use strict';

const api = globalThis.browser || globalThis.chrome;

const PORT_NAME = 'lili-stream';
const TIMEOUT_MS = 90000;
const TEST_TIMEOUT_MS = 20000;

const LANG_NAMES = { fr: 'français', en: 'anglais' };
const ENGLISH_LANG = { fr: 'French', en: 'English' };
const DEDICATED_TRANSLATION_MAX_CHARS = 12000;

const DEFAULT_SETTINGS = {
  connections: [
    {
      id: 'openai',
      label: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
    },
  ],
  fallback: { connection: 'openai', model: '' },
  routing: {
    translate: { connection: '', model: '' },
    rephrase_translate: { connection: '', model: '' },
    rephrase: { connection: '', model: '' },
    fix: { connection: '', model: '' },
    summarize: { connection: '', model: '' },
    summarize_page: { connection: '', model: '' },
  },
  language: { translateTarget: 'auto', output: 'fr' },
  rephrase: { tone: 'neutre' },
  summary: { length: 'moyen' },
  limits: {
    maxPageChars: 120000,
    maxSelectionChars: 20000,
    chunkChars: 14000,
    maxChunks: 8,
  },
  ui: {
    toolbar: true,
    pageAction: true,
    autoReplace: false,
    actions: ['translate', 'rephrase', 'rephrase_translate', 'summarize', 'fix'],
  },
};

const PROVIDER_LABELS = {
  openai: 'OpenAI / compatible',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
};

// --------------------------------------------------------------------- utils

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      out[key] = deepMerge(current, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function endpoint(baseUrl, path) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('URL de base manquante dans les réglages.');
  if (path.startsWith('/v1/') && /\/v1$/.test(base)) return base + path.slice(3);
  return base + path;
}


function chunkText(text, size) {
  const chunks = [];
  let rest = String(text || '');
  const limit = Math.max(1000, Number(size) || 14000);

  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf('. ', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit);
    if (cut <= 0) cut = limit;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

function abortError() {
  const error = new Error('Requête interrompue.');
  error.name = 'AbortError';
  return error;
}

// ------------------------------------------------------------------- settings

async function getSettings() {
  const stored = await api.storage.local.get('settings');
  const raw = migrateSettings((stored && stored.settings) || {});
  return deepMerge(DEFAULT_SETTINGS, raw);
}

async function saveSettings(incoming) {
  const current = await getSettings();
  const next = deepMerge(current, incoming || {});
  await api.storage.local.set({ settings: next });
  return next;
}

/** Convert the old single-provider settings to connections + routing. */
function migrateSettings(raw) {
  if (!raw || typeof raw !== 'object') return {};
  if (Array.isArray(raw.connections)) return raw;
  if (!raw.providers) return raw;

  const connections = [];
  for (const key of ['openai', 'anthropic', 'ollama']) {
    const provider = raw.providers[key];
    if (!provider) continue;
    connections.push({
      id: key,
      label: PROVIDER_LABELS[key] || key,
      type: key === 'anthropic' ? 'anthropic' : key === 'ollama' ? 'ollama' : 'openai',
      baseUrl: provider.baseUrl || '',
      apiKey: provider.apiKey || '',
      model: provider.model || '',
    });
  }

  const chosen = connections.find((c) => c.id === raw.provider) || connections[0] || null;
  const rest = { ...raw };
  delete rest.provider;
  delete rest.providers;

  return {
    ...rest,
    connections,
    fallback: { connection: chosen ? chosen.id : '', model: chosen ? chosen.model : '' },
  };
}

function connectionLabel(connection) {
  return (connection && (connection.label || connection.id)) || 'connexion';
}

function findConnection(settings, id) {
  if (!id) return null;
  return (settings.connections || []).find((c) => c.id === id) || null;
}

/** Resolve the connection and model for one action. */
function resolveRoute(action, settings) {
  const connections = settings.connections || [];
  if (!connections.length) {
    throw new Error('Aucune connexion configurée. Ouvre les réglages de Lili pour en ajouter une.');
  }

  const route = (settings.routing && settings.routing[action]) || {};
  const fallback = settings.fallback || {};
  const routeConnection = findConnection(settings, route.connection);
  const fallbackConnection = findConnection(settings, fallback.connection);
  const connection = routeConnection || fallbackConnection || connections[0];

  // An explicit route keeps its own connection's model as fallback.
  const model = routeConnection
    ? route.model || routeConnection.model
    : route.model || fallback.model || connection.model;

  if (!model) {
    throw new Error(
      'Aucun modèle défini pour cette tâche (' + connectionLabel(connection) + '). Ouvre les réglages de Lili.'
    );
  }
  return { connection, model };
}

function isLocalHost(url) {
  const host = hostOf(url);
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local')
  );
}

function validateConnection(connection) {
  if (!connection) throw new Error('Aucune connexion configurée.');
  if (!String(connection.baseUrl || '').trim()) {
    throw new Error('URL de base manquante pour ' + connectionLabel(connection) + '.');
  }

  // Local servers (vLLM, LiteLLM, Ollama) often run without an API key.
  if (connection.type !== 'ollama' && !isLocalHost(connection.baseUrl)) {
    if (!String(connection.apiKey || '').trim()) {
      throw new Error(
        'Clé API manquante pour ' + connectionLabel(connection) + '. Ouvre les réglages de Lili.'
      );
    }
  }
}

function isTranslationTask(action) {
  return action === 'translate' || action === 'rephrase_translate';
}

/** OVHcloud Olala translate expects source/target fields and no system prompt. */
function isDedicatedTranslationModel(model) {
  return /olala[^/]*translate/i.test(String(model || ''));
}

// --------------------------------------------------------------- language

const FR_WORDS = [
  'le', 'la', 'les', 'des', 'une', 'est', 'et', 'pour', 'que', 'qui', 'dans', 'avec',
  'sur', 'pas', 'plus', 'vous', 'nous', 'je', 'il', 'elle', 'ce', 'cette', 'sont',
  'être', 'avoir', 'du', 'au', 'aux', 'mais', 'comme', 'tout', 'fait', 'peut', 'dont',
  'aussi', 'leur', 'leurs', 'entre', 'sans', 'ses', 'son', 'sa', 'ces', 'ont', 'été',
];

const EN_WORDS = [
  'the', 'and', 'of', 'to', 'in', 'is', 'are', 'for', 'with', 'that', 'this', 'you',
  'it', 'on', 'as', 'be', 'have', 'was', 'were', 'from', 'at', 'by', 'not', 'or',
  'but', 'they', 'we', 'will', 'can', 'has', 'had', 'their', 'there', 'which', 'when',
  'what', 'how', 'its', 'our', 'your', 'these', 'those', 'been', 'would', 'should',
];

function countOccurrences(haystack, needle) {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function detectLanguage(input) {
  const raw = String(input || '').slice(0, 4000);
  if (!raw.trim()) return 'unknown';

  const normalized =
    ' ' + raw.toLowerCase().replace(/[^a-zà-ÿœæ'’]+/gi, ' ').replace(/\s+/g, ' ') + ' ';

  let fr = 0;
  let en = 0;
  for (const word of FR_WORDS) fr += countOccurrences(normalized, ' ' + word + ' ');
  for (const word of EN_WORDS) en += countOccurrences(normalized, ' ' + word + ' ');

  const accents = (raw.match(/[àâçéèêëîïôùûüÿœæ]/gi) || []).length;
  if (accents) fr += Math.min(8, accents * 0.7);

  const words = normalized.trim().split(' ').filter(Boolean).length;
  if (words < 4) return accents ? 'fr' : 'unknown';

  if (fr > en * 1.3) return 'fr';
  if (en > fr * 1.3) return 'en';
  return 'unknown';
}

function titleCaseFirst(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function resolveLanguages(action, text, settings) {
  const output = settings.language.output === 'en' ? 'en' : 'fr';
  const detected = detectLanguage(text);

  if (action === 'summarize' || action === 'fix') {
    return { output, outputName: LANG_NAMES[output], detected };
  }

  const mode = settings.language.translateTarget;
  const target = mode === 'fr' || mode === 'en' ? mode : detected === 'fr' ? 'en' : 'fr';
  const source = detected === 'unknown' ? target : detected;

  return {
    source,
    target,
    sourceName: LANG_NAMES[source] || LANG_NAMES[target],
    targetName: LANG_NAMES[target],
    output,
    outputName: LANG_NAMES[output],
    sameLanguage: source === target,
    detected,
    label: source !== target ? source.toUpperCase() + ' → ' + target.toUpperCase() : '',
  };
}

// ------------------------------------------------------------------ prompts

const TONES = {
  neutre: 'neutre et naturel',
  professionnel: 'professionnel, sobre et précis',
  decontracte: 'décontracté mais précis',
  academique: 'académique et rigoureux',
};

function summaryRule(length) {
  switch (length) {
    case 'court':
      return {
        rule: 'très court (2 à 3 phrases, ou 3 puces maximum)',
        format: '2 à 3 phrases, ou 3 puces si le texte s’y prête.',
        tokens: 500,
      };
    case 'detaille':
      return {
        rule:
          'une synthèse détaillée : une phrase de contexte, puis 4 à 7 puces avec les points clés, puis une ligne « À retenir : »',
        format:
          'une phrase de contexte, une liste de 4 à 7 puces, puis une ligne « À retenir : … ».',
        tokens: 1600,
      };
    default:
      return {
        rule: 'un paragraphe de 4 à 6 phrases, dense et fluide',
        format: 'un paragraphe de 4 à 6 phrases. Pas de liste.',
        tokens: 900,
      };
  }
}

function buildMessages(action, payload) {
  const { text, settings, languages } = payload;

  if (action === 'translate') {
    const targetName = languages.targetName;
    const system = [
      'Tu es un traducteur professionnel. Traduis le texte fourni en ' + targetName + '.',
      '',
      'Règles :',
      '- Conserve le sens, le ton, le registre et le niveau de détail.',
      '- Conserve la mise en forme : paragraphes, retours à la ligne, listes, ponctuation.',
      '- Ne traduis pas les noms propres, marques, URL, chemins de fichiers ni le code.',
      '- N’ajoute aucun commentaire, aucune note, aucun guillemet autour du résultat.',
      languages.sameLanguage
        ? '- Le texte semble déjà dans cette langue : corrige-le et rends-le plus naturel sans en changer le sens.'
        : '- Si un passage est déjà dans la langue cible, conserve-le tel quel.',
      '',
      'Réponds uniquement avec la traduction.',
    ].join('\n');

    return {
      messages: [systemMessage(system), userMessage(text)],
      maxTokens: 4000,
      temperature: 0.2,
    };
  }

  if (action === 'rephrase') {
    const tone = TONES[settings.rephrase.tone] || TONES.neutre;
    const system = [
      'Tu es un éditeur exigeant. Reformule le texte fourni, dans la même langue que lui.',
      '',
      'Règles :',
      '- Garde exactement le même sens, les mêmes faits, chiffres et nuances.',
      '- N’ajoute aucune information et n’en supprime aucune.',
      '- Améliore la clarté, la fluidité et la concision ; supprime lourdeurs et répétitions.',
      '- Conserve la mise en forme (paragraphes, listes) et le niveau de détail.',
      '- Ton attendu : ' + tone + '.',
      '',
      'Réponds uniquement avec le texte reformulé, sans préambule ni commentaire.',
    ].join('\n');

    return {
      messages: [systemMessage(system), userMessage(text)],
      maxTokens: 4000,
      temperature: 0.4,
    };
  }

  if (action === 'rephrase_translate') {
    const system = [
      'Reformule puis traduis le texte fourni.',
      '',
      '1. Reformule-le en ' + languages.sourceName + ' pour le rendre plus clair et plus fluide, sans changer le sens.',
      '2. Traduis la version reformulée en ' + languages.targetName + '.',
      '',
      'Contraintes : conserve les faits, les chiffres et la mise en forme ; n’ajoute rien ; ne commente pas.',
      'Réponds uniquement avec la version finale en ' + languages.targetName + '.',
    ].join('\n');

    return {
      messages: [systemMessage(system), userMessage(text)],
      maxTokens: 4000,
      temperature: 0.35,
    };
  }

  if (action === 'fix') {
    const system = [
      'Corrige le texte fourni dans sa langue d’origine : orthographe, grammaire, accords, ponctuation et typographie.',
      '',
      'Règles :',
      '- Ne change ni le sens, ni le style, ni la structure.',
      '- Ne reformule pas inutilement : corrige seulement ce qui doit l’être.',
      '- Conserve la mise en forme.',
      '',
      'Réponds uniquement avec le texte corrigé.',
    ].join('\n');

    return {
      messages: [systemMessage(system), userMessage(text)],
      maxTokens: 4000,
      temperature: 0.1,
    };
  }

  if (action === 'summarize') {
    const length = summaryRule(settings.summary.length);
    const system = [
      'Tu résumes un texte pour un lecteur pressé.',
      'Langue du résumé : ' + languages.outputName + '. Longueur : ' + length.rule + '.',
      '',
      'Règles :',
      '- Conserve les idées principales, les chiffres, les noms et les conclusions.',
      '- Supprime les exemples secondaires, les répétitions et les formules.',
      '- N’invente rien, n’ajoute aucun avis personnel.',
      '- Format attendu : ' + length.format,
      '',
      'Réponds uniquement avec le résumé.',
    ].join('\n');

    return {
      messages: [systemMessage(system), userMessage(text)],
      maxTokens: length.tokens,
      temperature: 0.25,
    };
  }

  throw new Error('Action non prise en charge : ' + action);
}

function systemMessage(content) {
  return { role: 'system', content };
}

function userMessage(content) {
  return { role: 'user', content };
}

function pageSummarizeMessages(page, content, lang, lengthSetting) {
  const length = summaryRule(lengthSetting);
  const title = page.title ? '« ' + page.title + ' »' : 'cette page';

  const system = [
    'Tu résumes ' + title + ' pour un lecteur pressé.',
    'Langue du résumé : ' + LANG_NAMES[lang] + '. Longueur : ' + length.rule + '.',
    '',
    'Règles :',
    '- Conserve les idées principales, les chiffres, les noms propres et les conclusions.',
    '- Ignore les menus, publicités, commentaires et contenus de navigation.',
    '- N’invente rien. Si une information n’est pas dans le texte, ne la mentionne pas.',
    '- Commence directement par le résumé, sans formule du type « Cet article… ».',
    '- Format attendu : ' + length.format,
    '',
    'Réponds uniquement avec le résumé.',
  ].join('\n');

  return {
    messages: [
      systemMessage(system),
      userMessage('Titre : ' + (page.title || '(sans titre)') + '\n\nContenu :\n' + content),
    ],
    maxTokens: length.tokens,
    temperature: 0.25,
  };
}

function pageChunkMessages(page, chunk, index, total) {
  const system = [
    'Tu prépares des notes de lecture factuelles à partir d’un extrait de page web.',
    '',
    'Règles :',
    '- Extrais uniquement les informations importantes : idées, faits, chiffres, noms, conclusions.',
    '- 3 à 6 puces maximum, chacune courte et autoportante.',
    '- Aucune introduction, aucun commentaire, aucune conclusion.',
    '- Écris dans la langue de l’extrait.',
  ].join('\n');

  return {
    messages: [
      systemMessage(system),
      userMessage(
        'Page : ' + (page.title || '(sans titre)') +
          '\nExtrait ' + index + '/' + total + ' :\n' + chunk
      ),
    ],
    maxTokens: 600,
    temperature: 0.2,
  };
}

function pageReduceMessages(page, notes, lang, lengthSetting, truncated) {
  const length = summaryRule(lengthSetting);

  const system = [
    'Tu rédiges le résumé final d’une page web à partir de notes partielles.',
    'Langue du résumé : ' + LANG_NAMES[lang] + '. Longueur : ' + length.rule + '.',
    '',
    'Règles :',
    '- Fusionne les notes en un résumé cohérent : supprime les redites, garde les faits, chiffres et noms.',
    '- N’ajoute aucune information absente des notes.',
    '- Commence directement par le résumé, sans formule d’introduction.',
    '- Format attendu : ' + length.format,
    truncated ? '- La page était longue : le résumé porte sur ses principales sections.' : '',
    '',
    'Réponds uniquement avec le résumé.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    messages: [
      systemMessage(system),
      userMessage(
        'Page : ' + (page.title || '(sans titre)') + '\n\nNotes :\n' + notes.join('\n\n')
      ),
    ],
    maxTokens: length.tokens,
    temperature: 0.25,
  };
}

// ---------------------------------------------------------------- transport

async function* readLines(response) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        yield line;
      }
    }

    if (buffer) {
      yield buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

async function streamSSE(response, handler) {
  let data = [];

  const flush = () => {
    if (!data.length) return;
    const payload = data.join('\n');
    data = [];
    handler(payload);
  };

  for await (const line of readLines(response)) {
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:') || line.startsWith('id:') || line.startsWith('retry:')) continue;
    if (line.startsWith('data:')) {
      let chunk = line.slice(5);
      if (chunk.startsWith(' ')) chunk = chunk.slice(1);
      data.push(chunk);
    }
  }
  flush();
}

async function streamNDJSON(response, handler) {
  for await (const line of readLines(response)) {
    if (!line.trim()) continue;
    handler(line);
  }
}

function isEventStream(response) {
  const type = (response.headers.get('content-type') || '').toLowerCase();
  return type.includes('text/event-stream');
}

function extractErrorMessage(body) {
  if (!body) return '';
  try {
    const data = JSON.parse(body);
    const error = data.error;
    if (typeof error === 'string') return error;
    if (error && error.message) return error.message;
    if (data.message) return data.message;
    if (data.detail) return typeof data.detail === 'string' ? data.detail : '';
  } catch {
    /* non-JSON body */
  }
  return body.replace(/\s+/g, ' ').slice(0, 300);
}

async function requestOrThrow(url, init, label) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    throw new Error(
      'Impossible de joindre ' +
        label +
        '. Vérifie l’URL de base, ta connexion, et l’autorisation d’accès à cet hôte (bouton « Enregistrer » dans les réglages).'
    );
  }

  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      /* ignore */
    }
    const detail = extractErrorMessage(body);
    const suffix = detail ? '\n\nDétail : ' + detail : '';

    const fail = (text) => {
      const error = new Error(text);
      error.status = response.status;
      return error;
    };

    if (response.status === 401 || response.status === 403) {
      throw fail('Accès refusé (' + response.status + '). Vérifie la clé API dans les réglages.' + suffix);
    }
    if (response.status === 404) {
      throw fail(
        'Endpoint ou modèle introuvable (404). Vérifie l’URL de base et le nom du modèle.' + suffix
      );
    }
    if (response.status === 429) {
      throw fail('Quota ou limite de débit atteint (429). Réessaie dans un instant.' + suffix);
    }
    throw fail('Erreur du service (' + response.status + ').' + suffix);
  }

  return response;
}

// Stable session id for OpenCode gateways (Go expects it on every request).
let sessionId = null;

function clientSessionId() {
  if (!sessionId) {
    const random =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 24)
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionId = 'ses_lili_' + random;
    api.storage.local.set({ clientSession: sessionId }).catch(() => {});
  }
  return sessionId;
}

api.storage.local
  .get('clientSession')
  .then((stored) => {
    if (stored && stored.clientSession) sessionId = stored.clientSession;
  })
  .catch(() => {});

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Headers for one connection, including provider quirks. */
function buildHeaders(connection, json, options) {
  const opts = options || {};
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';

  const host = hostOf(connection.baseUrl);
  const withAuth = opts.auth !== false;

  if (withAuth && connection.type === 'anthropic') {
    headers['x-api-key'] = connection.apiKey || '';
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else if (withAuth && connection.type !== 'ollama') {
    headers.Authorization = 'Bearer ' + (connection.apiKey || '');
  } else if (connection.type === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01';
  }

  if (host === 'opencode.ai' || host.endsWith('.opencode.ai')) {
    headers['x-opencode-session'] = connection.sessionId || clientSessionId();
  }
  if (host === 'openrouter.ai' || host.endsWith('.openrouter.ai')) {
    headers['X-Title'] = 'Lili';
  }

  if (connection.headers && typeof connection.headers === 'object') {
    for (const [key, value] of Object.entries(connection.headers)) {
      if (typeof value === 'string') headers[key] = value;
    }
  }

  return headers;
}

function modelsUrl(connection) {
  const base = String(connection.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  if (connection.type === 'ollama') return base + '/api/tags';
  if (connection.type === 'anthropic') return /\/v1$/.test(base) ? base + '/models' : base + '/v1/models';
  if (/\/openai\/v1$/.test(base)) return base.replace(/\/openai\/v1$/, '/v1/models');
  if (/\/v1$/.test(base)) return base + '/models';
  return base + '/v1/models';
}

const MODEL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

async function listModels(connection, refresh) {
  validateConnection(connection);

  const stored = await api.storage.local.get('modelCache');
  const cache = stored.modelCache || {};
  const entry = cache[connection.id];
  const cached = entry && entry.baseUrl === connection.baseUrl && Array.isArray(entry.models);

  if (!refresh && cached && Date.now() - entry.at < MODEL_CACHE_TTL) {
    return entry.models;
  }

  const url = modelsUrl(connection);
  if (!url) throw new Error('URL de base manquante.');

  let models;
  try {
    let response;
    try {
      response = await requestOrThrow(
        url,
        { method: 'GET', headers: buildHeaders(connection, false) },
        connectionLabel(connection)
      );
    } catch (error) {
      // Model catalogs are often public (OVHcloud, OpenRouter): retry without the key.
      if (
        connection.type === 'openai' &&
        (error.status === 401 || error.status === 403)
      ) {
        response = await requestOrThrow(
          url,
          { method: 'GET', headers: buildHeaders(connection, false, { auth: false }) },
          connectionLabel(connection)
        );
      } else {
        throw error;
      }
    }

    const data = await response.json().catch(() => null);
    if (!data) throw new Error('Réponse inattendue de la liste des modèles.');

    const list =
      connection.type === 'ollama'
        ? data.models || []
        : Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.models)
            ? data.models
            : [];

    const isTextModel = (item) => {
      const id = String(item.id || item.name || item.model || '');
      if (!id) return false;
      if (typeof item.context_length === 'number' && item.context_length === 0) return false;
      return !/(^|[-_/])(tts|whisper|embedding|embeddings|embed|bge|stable-diffusion|sd[-_]?xl)([-_/]|$)/i.test(
        id
      );
    };

    models = [...new Set(list.filter(isTextModel).map((item) => item.id || item.name || item.model))]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 1000);
  } catch (error) {
    if (cached) return entry.models;
    throw error;
  }

  cache[connection.id] = { baseUrl: connection.baseUrl, at: Date.now(), models };
  await api.storage.local.set({ modelCache: cache });
  return models;
}

// ---------------------------------------------------------------- adapters

async function callModel(options) {
  const type = options.connection && options.connection.type;
  if (type === 'anthropic') return callAnthropic(options);
  if (type === 'ollama') return callOllama(options);
  return callOpenAI(options);
}

async function callOpenAI({
  connection,
  model,
  messages,
  extraBody,
  maxTokens,
  temperature,
  stream,
  onDelta,
  signal,
  touch,
}) {
  const url = endpoint(connection.baseUrl, '/chat/completions');

  const body = { model, messages, stream: !!stream };
  if (typeof temperature === 'number') body.temperature = temperature;
  if (maxTokens) body.max_tokens = maxTokens;
  if (extraBody && typeof extraBody === 'object') Object.assign(body, extraBody);

  const response = await requestOrThrow(
    url,
    {
      method: 'POST',
      headers: {
        ...buildHeaders(connection, true),
        Accept: stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    },
    connectionLabel(connection)
  );

  if (!stream || !isEventStream(response)) {
    const data = await response.json().catch(() => ({}));
    const message = data && data.choices && data.choices[0] && data.choices[0].message;
    const text = message && typeof message.content === 'string' ? message.content : '';
    if (!text.trim()) throw new Error('Réponse vide ou inattendue du fournisseur.');
    if (onDelta) onDelta(text);
    return text;
  }

  let result = '';
  await streamSSE(response, (payload) => {
    if (payload === '[DONE]') return;
    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    if (json.error) throw new Error(json.error.message || 'Erreur renvoyée par le fournisseur.');
    const choice = json.choices && json.choices[0];
    const delta = choice && (choice.delta || choice.message);
    const text = delta && typeof delta.content === 'string' ? delta.content : '';
    if (text) {
      result += text;
      if (onDelta) onDelta(text);
      if (touch) touch();
    }
  });

  if (!result.trim()) throw new Error('Le modèle a renvoyé une réponse vide.');
  return result;
}

async function callAnthropic({
  connection,
  model,
  messages,
  maxTokens,
  temperature,
  stream,
  onDelta,
  signal,
  touch,
}) {
  const url = endpoint(connection.baseUrl, '/v1/messages');

  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const conversation = messages.filter((m) => m.role !== 'system');

  const body = {
    model,
    max_tokens: maxTokens || 2000,
    messages: conversation,
    stream: !!stream,
  };
  if (typeof temperature === 'number') body.temperature = temperature;
  if (system) body.system = system;

  const response = await requestOrThrow(
    url,
    {
      method: 'POST',
      headers: buildHeaders(connection, true),
      body: JSON.stringify(body),
      signal,
    },
    connectionLabel(connection)
  );

  if (!stream || !isEventStream(response)) {
    const data = await response.json().catch(() => ({}));
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    if (!text.trim()) throw new Error('Réponse vide ou inattendue d’Anthropic.');
    if (onDelta) onDelta(text);
    return text;
  }

  let result = '';
  await streamSSE(response, (payload) => {
    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    if (json.type === 'error') {
      throw new Error((json.error && json.error.message) || 'Erreur renvoyée par Anthropic.');
    }
    if (json.type === 'content_block_delta' && json.delta && json.delta.type === 'text_delta') {
      const text = json.delta.text || '';
      if (text) {
        result += text;
        if (onDelta) onDelta(text);
        if (touch) touch();
      }
    }
  });

  if (!result.trim()) throw new Error('Le modèle a renvoyé une réponse vide.');
  return result;
}

async function callOllama({
  connection,
  model,
  messages,
  maxTokens,
  temperature,
  stream,
  onDelta,
  signal,
  touch,
}) {
  const url = endpoint(connection.baseUrl, '/api/chat');

  const body = {
    model,
    messages,
    stream: !!stream,
    options: {
      temperature: typeof temperature === 'number' ? temperature : 0.3,
      num_predict: maxTokens || 2000,
    },
  };

  const response = await requestOrThrow(
    url,
    {
      method: 'POST',
      headers: {
        ...buildHeaders(connection, true),
        Accept: stream ? 'application/x-ndjson' : 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    },
    connectionLabel(connection)
  );

  if (!stream) {
    const data = await response.json().catch(() => ({}));
    const text = data && data.message && typeof data.message.content === 'string' ? data.message.content : '';
    if (!text.trim()) throw new Error('Réponse vide ou inattendue d’Ollama (modèle chargé ?).');
    if (onDelta) onDelta(text);
    return text;
  }

  let result = '';
  await streamNDJSON(response, (line) => {
    let json;
    try {
      json = JSON.parse(line);
    } catch {
      return;
    }
    if (json.error) throw new Error(json.error);
    const text = json.message && typeof json.message.content === 'string' ? json.message.content : '';
    if (text) {
      result += text;
      if (onDelta) onDelta(text);
      if (touch) touch();
    }
  });

  if (!result.trim()) throw new Error('Le modèle a renvoyé une réponse vide.');
  return result;
}

// --------------------------------------------------------------- page summary

async function summarizePageJob({ page, settings, route, post, signal, touch }) {
  const content = String((page && page.text) || '').trim();
  if (content.length < 150) {
    throw new Error('Cette page ne contient pas assez de texte à résumer.');
  }

  const lang = settings.language.output === 'en' ? 'en' : 'fr';
  const base = {
    connection: route.connection,
    model: route.model,
    maxTokens: 0,
    temperature: 0.25,
    stream: true,
    signal,
    touch,
  };

  const clipped = content.slice(0, settings.limits.maxPageChars);
  const chunks = chunkText(clipped, settings.limits.chunkChars);
  const maxChunks = Math.max(1, settings.limits.maxChunks);
  const used = chunks.slice(0, maxChunks);

  post({
    type: 'meta',
    text: titleCaseFirst(LANG_NAMES[lang]) + ' · ' + used.length + ' section' + (used.length > 1 ? 's' : ''),
  });

  const done = () =>
    post({ type: 'done', provider: connectionLabel(route.connection), model: route.model });

  if (used.length <= 1) {
    const prepared = pageSummarizeMessages(page, clipped, lang, settings.summary.length);
    await callModel({ ...base, ...prepared, onDelta: (text) => post({ type: 'delta', text }) });
    done();
    return;
  }

  const notes = [];
  for (let index = 0; index < used.length; index++) {
    if (signal.aborted) throw abortError();
    post({ type: 'status', text: 'Lecture de la page… section ' + (index + 1) + '/' + used.length });
    touch();

    const prepared = pageChunkMessages(page, used[index], index + 1, used.length);
    notes.push(
      await callModel({
        ...base,
        ...prepared,
        stream: false,
        maxTokens: 600,
        temperature: 0.2,
      })
    );
  }

  if (signal.aborted) throw abortError();
  post({ type: 'status', text: 'Synthèse du résumé…' });
  touch();

  const prepared = pageReduceMessages(
    page,
    notes,
    lang,
    settings.summary.length,
    clipped.length > maxChunks * settings.limits.chunkChars
  );
  await callModel({ ...base, ...prepared, onDelta: (text) => post({ type: 'delta', text }) });
  done();
}

// ---------------------------------------------------------------------- jobs

function explainError(error, timedOut) {
  if (timedOut) {
    return 'Délai dépassé (90 s sans réponse). Essaie un texte plus court, un modèle plus rapide, ou vérifie la connexion.';
  }
  const message = (error && error.message) || String(error || 'Erreur inconnue.');
  if (/Failed to fetch|NetworkError|Load failed|Network request failed/i.test(message)) {
    return 'Impossible de joindre l’API. Vérifie l’URL de base et l’autorisation d’accès à cet hôte dans les réglages.';
  }
  return message;
}

async function runJob({ port, message, post, signal, touch, isTimedOut }) {
  const settings = await getSettings();
  const action = String(message.action || '');
  const known = ['translate', 'rephrase', 'rephrase_translate', 'summarize', 'fix', 'summarize_page'];
  if (!known.includes(action)) throw new Error('Action inconnue : ' + action);

  const route = resolveRoute(action, settings);
  validateConnection(route.connection);

  if (action === 'summarize_page') {
    await summarizePageJob({ page: message.page || {}, settings, route, post, signal, touch });
    return;
  }

  const text = String(message.text || '').trim();
  if (!text) throw new Error('Aucun texte à traiter.');

  const maxChars = settings.limits.maxSelectionChars;
  if (text.length > maxChars) {
    throw new Error(
      'Sélection trop longue : ' +
        text.length +
        ' caractères (maximum ' +
        maxChars +
        '). Sélectionne un passage plus court, ou utilise « Résumer la page ».'
    );
  }

  const languages = resolveLanguages(action, text, settings);

  if (languages.label) post({ type: 'meta', text: languages.label });
  else if (action === 'summarize') {
    post({ type: 'meta', text: titleCaseFirst(languages.outputName) });
  }

  const prepared = buildMessages(action, { text, settings, languages });

  let messages = prepared.messages;
  let extraBody = null;
  let temperature = prepared.temperature;

  // Dedicated translation models take the text plus explicit language fields.
  if (isTranslationTask(action) && isDedicatedTranslationModel(route.model)) {
    if (text.length > DEDICATED_TRANSLATION_MAX_CHARS) {
      throw new Error(
        'Ce modèle de traduction dédié accepte environ ' +
          DEDICATED_TRANSLATION_MAX_CHARS.toLocaleString('fr-FR') +
          ' caractères. Sélectionne un passage plus court.'
      );
    }
    messages = [userMessage(text)];
    extraBody = {
      source_language: ENGLISH_LANG[languages.source] || ENGLISH_LANG[languages.target] || 'English',
      target_language: ENGLISH_LANG[languages.target] || 'French',
    };
    temperature = undefined;
  }

  const result = await callModel({
    connection: route.connection,
    model: route.model,
    messages,
    extraBody,
    maxTokens: prepared.maxTokens,
    temperature,
    stream: true,
    signal,
    touch,
    onDelta: (delta) => post({ type: 'delta', text: delta }),
  });

  if (isTimedOut()) throw new Error('Délai dépassé.');

  post({
    type: 'done',
    provider: connectionLabel(route.connection),
    model: route.model,
    chars: result.length,
  });
}

async function testConnection(connection) {
  validateConnection(connection);
  if (!connection.model) throw new Error('Renseigne un modèle par défaut pour cette connexion.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  const started = Date.now();

  try {
    const reply = await callModel({
      connection,
      model: connection.model,
      messages: [
        systemMessage('Tu es un test de connexion. Réponds uniquement par : OK'),
        userMessage('Réponds uniquement par : OK'),
      ],
      maxTokens: 16,
      temperature: 0,
      stream: false,
      signal: controller.signal,
      onDelta: null,
    });
    return { ok: true, ms: Date.now() - started, text: String(reply).trim().slice(0, 120) };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Pas de réponse en 20 s. Vérifie l’URL et que le service tourne.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ menus

const MENUS = [
  { id: 'lili-translate', title: 'Traduire la sélection', contexts: ['selection'] },
  { id: 'lili-rephrase', title: 'Reformuler la sélection', contexts: ['selection'] },
  { id: 'lili-rephrase-translate', title: 'Reformuler puis traduire', contexts: ['selection'] },
  { id: 'lili-summarize', title: 'Résumer la sélection', contexts: ['selection'] },
  { id: 'lili-fix', title: 'Corriger la sélection', contexts: ['selection'] },
  { id: 'lili-summarize-page', title: 'Résumer cette page', contexts: ['page', 'frame'] },
  { id: 'lili-options', title: 'Réglages de Lili…', contexts: ['action'] },
];

function createMenus() {
  for (const item of MENUS) {
    try {
      api.contextMenus.create(item);
    } catch {
      /* already created */
    }
  }
}

function resetMenus() {
  try {
    const pending = api.contextMenus.removeAll();
    if (pending && typeof pending.then === 'function') {
      pending.then(createMenus).catch(createMenus);
    } else {
      setTimeout(createMenus, 0);
    }
  } catch {
    createMenus();
  }
}

api.runtime.onInstalled.addListener((details) => {
  resetMenus();
  if (details && details.reason === 'install') {
    try {
      api.runtime.openOptionsPage();
    } catch {
      /* ignore */
    }
  }
});

api.runtime.onStartup.addListener(() => {
  resetMenus();
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId || '');

  if (id === 'lili-options') {
    api.runtime.openOptionsPage();
    return;
  }
  if (!tab || typeof tab.id !== 'number') return;

  const action = id.replace(/^lili-/, '').replace(/-/g, '_');
  const message = { type: 'lili:run', action };

  // Selection inside an iframe: the top-frame content script cannot read it.
  if (info.frameId && info.selectionText) message.text = info.selectionText;

  sendToTab(tab.id, message);
});

const COMMANDS = {
  'translate-selection': 'translate',
  'rephrase-selection': 'rephrase',
  'summarize-selection': 'summarize',
  'summarize-page': 'summarize_page',
};

api.commands.onCommand.addListener(async (command) => {
  const action = COMMANDS[command];
  if (!action) return;
  try {
    const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs && tabs[0];
    if (tab && typeof tab.id === 'number') {
      sendToTab(tab.id, { type: 'lili:run', action });
    }
  } catch {
    /* ignore */
  }
});

async function sendToTab(tabId, message) {
  try {
    await api.tabs.sendMessage(tabId, message);
  } catch {
    /* no content script (chrome://, native PDF, store…) */
  }
}

// ------------------------------------------------------------------ messages

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return;

  const respond = (promise) => {
    promise
      .then((value) => sendResponse(value))
      .catch((error) =>
        sendResponse({ ok: false, error: (error && error.message) || String(error) })
      );
    return true;
  };

  if (message.type === 'lili:get-settings') {
    return respond(getSettings());
  }

  if (message.type === 'lili:save-settings') {
    return respond(
      saveSettings(message.settings).then((settings) => ({ ok: true, settings }))
    );
  }

  if (message.type === 'lili:reset-settings') {
    return respond(
      api.storage.local
        .set({ settings: DEFAULT_SETTINGS })
        .then(() => ({ ok: true, settings: DEFAULT_SETTINGS }))
    );
  }

  if (message.type === 'lili:test') {
    return respond(
      testConnection(message.connection).then((result) => ({
        ok: true,
        ...result,
      }))
    );
  }

  if (message.type === 'lili:list-models') {
    return respond(
      listModels(message.connection, message.refresh).then((models) => ({ ok: true, models }))
    );
  }

  if (message.type === 'lili:open-options') {
    try {
      api.runtime.openOptionsPage();
    } catch {
      /* ignore */
    }
    sendResponse({ ok: true });
    return;
  }
});

// -------------------------------------------------------------------- ports

api.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  const controller = new AbortController();
  let started = false;
  let closed = false;
  let keepalive = null;
  let watchdog = null;
  let timedOut = false;

  const post = (message) => {
    if (closed) return;
    try {
      port.postMessage(message);
    } catch {
      /* port already closed */
    }
  };

  const stopTimers = () => {
    if (keepalive) clearInterval(keepalive);
    if (watchdog) clearTimeout(watchdog);
    keepalive = null;
    watchdog = null;
  };

  const touch = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
  };

  port.onMessage.addListener((message) => {
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'abort') {
      controller.abort();
      return;
    }
    if (message.type !== 'start' || started) return;

    started = true;
    touch();

    // Keep the service worker alive during long calls.
    keepalive = setInterval(() => {
      try {
        const pending = api.runtime.getPlatformInfo();
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      } catch {
        /* ignore */
      }
    }, 20000);

    runJob({
      port,
      message,
      post,
      signal: controller.signal,
      touch,
      isTimedOut: () => timedOut,
    })
      .catch((error) => {
        if (controller.signal.aborted && !timedOut) return;
        post({ type: 'error', message: explainError(error, timedOut) });
      })
      .finally(() => {
        stopTimers();
        closed = true;
        try {
          port.disconnect();
        } catch {
          /* ignore */
        }
      });
  });

  port.onDisconnect.addListener(() => {
    closed = true;
    stopTimers();
    controller.abort();
  });
});
