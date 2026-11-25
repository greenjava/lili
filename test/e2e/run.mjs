// End-to-end test: loads the extension in Chrome, drives selections, checks
// streaming, replacement and page summaries. Requires dist/chrome and Chrome.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startMocks } from './mock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC = path.join(ROOT, 'dist/chrome');
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lili-e2e-'));
const EXT = path.join(TEMP, 'ext');
const PROFILE = path.join(TEMP, 'profile');
const SHOTS = process.env.E2E_ARTIFACTS
  ? path.join(HERE, 'artifacts')
  : path.join(TEMP, 'shots');

const mocks = await startMocks();
const API = mocks.generalUrl;
const API_SUMMARY = mocks.summaryUrl;
const DEMO = mocks.demoUrl;

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const cached = findExecutable(path.join(ROOT, '.cache/chrome'), 0);
  if (cached) return cached;

  throw new Error('Chrome introuvable. Définis CHROME_PATH (Chrome ou Chrome for Testing).');
}

function findExecutable(dir, depth) {
  if (!dir || depth > 4 || !fs.existsSync(dir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findExecutable(full, depth + 1);
      if (nested) return nested;
    } else if (entry.name === 'chrome') {
      return full;
    }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, condition, detail) {
  results.push({ name, ok: !!condition, detail });
  console.log(`${condition ? '✓' : '✗'} ${name}${detail && !condition ? ' → ' + detail : ''}`);
}

function prepareExtension() {
  if (!fs.existsSync(SRC)) {
    throw new Error('dist/chrome manquant : lance `npm run build` avant les tests e2e.');
  }
  fs.rmSync(EXT, { recursive: true, force: true });
  fs.cpSync(SRC, EXT, { recursive: true });
  const manifestPath = path.join(EXT, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = manifest.host_permissions || [];
  manifest.host_permissions.push(...mocks.origins);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

const TRANSLATION = 'OVH-TRANSLATION[French->English]: This is the translated version of your text.';

const SETTINGS = {
  connections: [
    { id: 'mock', label: 'Mock A', type: 'openai', baseUrl: API, apiKey: 'test-key', model: 'mock-1' },
    { id: 'summary', label: 'Mock B', type: 'openai', baseUrl: API_SUMMARY, apiKey: 'test-key', model: 'mock-summary' },
    { id: 'ovh', label: 'OVHcloud', type: 'openai', baseUrl: API, apiKey: 'test-key', model: 'Olala-v1.0-mini-7A1B' },
  ],
  fallback: { connection: 'mock', model: '' },
  routing: {
    translate: { connection: 'ovh', model: 'Olala-v1.0-translate' },
    rephrase_translate: { connection: 'ovh', model: 'Olala-v1.0-translate' },
    rephrase: { connection: 'mock', model: '' },
    fix: { connection: 'mock', model: '' },
    summarize: { connection: 'summary', model: 'mock-summary' },
    summarize_page: { connection: 'summary', model: 'mock-summary' },
    refine: { connection: 'mock', model: '' },
  },
  language: { translateTarget: 'auto', output: 'fr' },
  rephrase: { tone: 'neutre' },
  summary: { length: 'moyen' },
  limits: { maxPageChars: 100000, maxSelectionChars: 20000, chunkChars: 1000, maxChunks: 8 },
  siteRules: { disabled: [], targets: {} },
  ui: {
    toolbar: true,
    pageAction: true,
    autoReplace: false,
    directMode: false,
    context: false,
    actions: ['translate', 'rephrase', 'rephrase_translate', 'summarize', 'fix'],
  },
};

async function shadow(page, expr) {
  return page.evaluate((code) => {
    const root = document.getElementById('lili-root');
    if (!root || !root.shadowRoot) return null;
    // eslint-disable-next-line no-new-func
    return new Function('root', 'return (' + code + ')')(root.shadowRoot);
  }, expr);
}

async function waitBar(page) {
  await page.waitForFunction(
    () => {
      const bar = document.getElementById('lili-root')?.shadowRoot?.querySelector('.lili-bar');
      return bar && !bar.hidden;
    },
    { timeout: 8000 }
  );
}

async function waitResult(page) {
  await page.waitForFunction(
    () => {
      const root = document.getElementById('lili-root')?.shadowRoot;
      if (!root) return false;
      const panel = root.querySelector('.lili-panel');
      if (!panel || panel.hidden || panel.classList.contains('is-streaming')) return false;
      const error = root.querySelector('.lili-error');
      return (error && !error.hidden) || root.querySelector('.lili-text').textContent.trim().length > 0;
    },
    { timeout: 30000 }
  );
  await sleep(120);
}

async function panelText(page) {
  return shadow(page, "root.querySelector('.lili-text').textContent");
}

async function panelError(page) {
  return shadow(page, "(() => { const e = root.querySelector('.lili-error'); return e && !e.hidden ? e.textContent : ''; })()");
}

async function panelMeta(page) {
  return shadow(page, "root.querySelector('.lili-meta').textContent");
}

async function clickAction(page, action) {
  await shadow(page, `root.querySelector('[data-action="${action}"]').click()`);
}

async function clickUi(page, name) {
  await shadow(page, `root.querySelector('[data-ui="${name}"]').click()`);
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: file });
  return file;
}

async function selectTextarea(page, id) {
  await page.evaluate((elementId) => {
    const el = document.getElementById(elementId);
    el.focus();
    el.setSelectionRange(0, el.value.length);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 10 }));
  }, id);
}

async function selectElement(page, id) {
  await page.evaluate((elementId) => {
    const el = document.getElementById(elementId);
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 10 }));
  }, id);
}

async function main() {
  prepareExtension();
  fs.rmSync(PROFILE, { recursive: true, force: true });

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    userDataDir: PROFILE,
    // The assertions below expect the French UI; force the extension locale.
    env: { ...process.env, LANGUAGE: 'fr', LANG: 'fr_FR.UTF-8' },
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--lang=fr-FR',
      '--disable-features=Translate',
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--window-size=1280,900',
      // GitHub runners disable unprivileged user namespaces.
      ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    ],
    defaultViewport: { width: 1280, height: 900 },
  });

  const consoleErrors = [];

  try {
    const sw = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url().includes('background.js'),
      { timeout: 20000 }
    );
    const extId = new URL(sw.url()).host;
    console.log('Extension ID :', extId);

    const swWorker = await sw.worker();
    const commands = await swWorker.evaluate(() => chrome.commands.getAll());
    const assignedShortcuts = commands.filter(
      (command) => command.name !== '_execute_action' && command.shortcut
    );
    check(
      'raccourcis : assignés',
      assignedShortcuts.length === 4,
      JSON.stringify(commands.map((command) => [command.name, command.shortcut]))
    );

    // --- options ---
    const options = await browser.newPage();
    options.on('console', (m) => m.type() === 'error' && consoleErrors.push('options: ' + m.text()));
    options.on('pageerror', (e) => consoleErrors.push('options: ' + e.message));

    await options.goto(`chrome-extension://${extId}/options/options.html`, { waitUntil: 'domcontentloaded' });

    // migration from the old single-provider format
    await options.evaluate(() => new Promise((resolve) => chrome.storage.local.set({
      settings: {
        provider: 'ollama',
        providers: {
          openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-x', model: 'gpt-4o-mini' },
          anthropic: { baseUrl: 'https://api.anthropic.com', apiKey: '', model: 'claude-3-5-haiku-latest' },
          ollama: { baseUrl: 'http://localhost:11434', apiKey: '', model: 'llama3.1:8b' },
        },
        language: { translateTarget: 'auto', output: 'fr' },
      },
    }, resolve)));
    const migrated = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'lili:get-settings' }));
    check(
      'migration : ancien format converti',
      migrated.connections.length === 3 && migrated.fallback.connection === 'ollama' && migrated.fallback.model === 'llama3.1:8b',
      JSON.stringify({ connections: migrated.connections.length, fallback: migrated.fallback })
    );

    await options.evaluate((settings) => {
      return new Promise((resolve) => chrome.storage.local.set({ settings }, resolve));
    }, SETTINGS);
    await options.reload({ waitUntil: 'networkidle0' });
    await options.waitForFunction(() => document.querySelectorAll('#connections .conn').length === 3);

    // model lists are prefetched in the background
    await options.waitForFunction(
      () => {
        const select = document.querySelector('#connections .conn [data-field="model"] select');
        return select && select.options.length >= 5;
      },
      { timeout: 20000 }
    );

    const filled = await options.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#routes .route:not(.route-head)'));
      const translate = rows[1];
      return {
        connections: document.querySelectorAll('#connections .conn').length,
        routes: rows.length,
        base: document.querySelector('#connections .conn [data-field="baseUrl"]').value,
        model: document.querySelector('#connections .conn [data-field="model"] select').value,
        translateConnection: translate.querySelector('select').value,
        translateModel: translate.querySelector('.picker select').value,
        actions: document.querySelectorAll('#actions input:checked').length,
      };
    });
    check('options : connexions affichées', filled.connections === 3, String(filled.connections));
    check('options : une ligne par tâche', filled.routes === 8, String(filled.routes));
    check('options : URL et modèle chargés', filled.base === API && filled.model === 'mock-1', JSON.stringify(filled));
    check(
      'options : routage chargé',
      filled.translateConnection === 'ovh' && filled.translateModel === 'Olala-v1.0-translate',
      JSON.stringify({ c: filled.translateConnection, m: filled.translateModel })
    );
    check('options : actions cochées', filled.actions === 5, String(filled.actions));

    await options.waitForFunction(
      () => {
        const states = Array.from(document.querySelectorAll('.shortcut-state'));
        return states.length === 4 && states.every((state) => state.textContent.includes('assigné'));
      },
      { timeout: 5000 }
    );
    check('options : raccourcis assignés affichés', true);
    await options.evaluate(() => window.scrollTo(0, 0));
    await shot(options, '01-options');
    await options.evaluate(() => document.querySelector('#routes').scrollIntoView({ block: 'center' }));
    await sleep(250);
    await shot(options, '01b-routes');

    // --- test de connexion (première carte) ---
    await options.click('#connections .conn [data-act="test"]');
    await options.waitForFunction(
      () => {
        const el = document.querySelector('#connections .conn .conn-msg');
        return el && !el.hidden && /Connexion OK|Accès|Échec|refus/i.test(el.textContent);
      },
      { timeout: 20000 }
    );
    const testText = await options.$eval('#connections .conn .conn-msg', (el) => el.textContent);
    check('options : test de connexion', /Connexion OK/.test(testText), testText);

    // --- liste des modèles (rafraîchissement) ---
    await options.click('#connections .conn [data-act="models"]');
    await options.waitForFunction(
      () => {
        const select = document.querySelector('#connections .conn [data-field="model"] select');
        return select && select.options.length === 5;
      },
      { timeout: 20000 }
    );
    const modelCount = await options.evaluate(
      () => document.querySelector('#connections .conn [data-field="model"] select').options.length
    );
    check('options : modèles listés', modelCount === 5, String(modelCount));

    // --- enregistrement depuis l'interface ---
    await options.click('#save');
    await options.waitForFunction(
      () => /enregistrés/.test(document.querySelector('#status').textContent),
      { timeout: 20000 }
    );
    const saved = await options.evaluate(
      () => new Promise((resolve) => chrome.storage.local.get('settings', resolve))
    );
    check(
      'options : enregistrement',
      saved.settings && saved.settings.connections.length === 3 && saved.settings.routing.translate.model === 'Olala-v1.0-translate',
      JSON.stringify(saved.settings && saved.settings.connections.length)
    );

    // --- ajout d'une connexion depuis un préréglage ---
    await options.select('#preset', 'openrouter');
    await options.click('#add-connection');
    await options.waitForFunction(
      () => document.querySelectorAll('#connections .conn').length === 4,
      { timeout: 5000 }
    );
    check('options : ajout d’une connexion', true);

    // --- page de démo ---
    const demo = await browser.newPage();
    demo.on('console', (m) => m.type() === 'error' && consoleErrors.push('demo: ' + m.text()));
    demo.on('pageerror', (e) => consoleErrors.push('demo: ' + e.message));
    await demo.goto(DEMO, { waitUntil: 'domcontentloaded' });
    await demo.bringToFront();
    await sleep(600);

    // 1. Traduire dans un textarea + remplacer
    await selectTextarea(demo, 'field');
    await waitBar(demo);
    check('barre flottante : visible sur sélection dans un champ', true);

    await sleep(350);
    await demo.screenshot({ path: path.join(SHOTS, '02-toolbar.png') });

    await clickAction(demo, 'translate');
    await waitResult(demo);
    const translated = await panelText(demo);
    const meta = await panelMeta(demo);
    check('traduction : modèle dédié utilisé', translated.startsWith('OVH-TRANSLATION[French->English]'), translated);
    check('traduction : direction affichée', /FR → EN/.test(meta), meta);

    const closeLayout = await shadow(demo, `(() => {
      const panel = root.querySelector('.lili-panel').getBoundingClientRect();
      const header = root.querySelector('.lili-head [data-ui="close"]');
      const rect = header && header.getBoundingClientRect();
      return {
        headerVisible: !!rect && rect.width > 0 && rect.right <= panel.right + 1 && rect.left >= panel.left,
        footerClose: root.querySelectorAll('.lili-foot [data-ui="close"]').length,
        panelWidth: Math.round(panel.width),
      };
    })()`);
    check(
      'panneau : une seule croix, visible',
      closeLayout.headerVisible && closeLayout.footerClose === 0,
      JSON.stringify(closeLayout)
    );

    await shot(demo, '03-panel-translate');

    // drag by the header
    const dragStart = await shadow(
      demo,
      "(() => { const r = root.querySelector('.lili-panel').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()"
    );
    await demo.mouse.move(dragStart.left + 40, dragStart.top + 16);
    await demo.mouse.down();
    await demo.mouse.move(dragStart.left - 80, dragStart.top - 60, { steps: 6 });
    await demo.mouse.up();
    const dragged = await shadow(
      demo,
      "(() => { const r = root.querySelector('.lili-panel').getBoundingClientRect(); return { left: r.left, top: r.top }; })()"
    );
    check(
      'panneau : déplaçable à la souris',
      Math.abs(dragged.left - (dragStart.left - 120)) < 3 &&
        Math.abs(dragged.top - (dragStart.top - 76)) < 3,
      JSON.stringify({ dragged, dragStart })
    );

    // resize with the bottom-right handle
    const resizeStart = await shadow(
      demo,
      "(() => { const r = root.querySelector('.lili-panel').getBoundingClientRect(); return { right: r.right, bottom: r.bottom, width: r.width, height: r.height }; })()"
    );
    await demo.mouse.move(resizeStart.right - 6, resizeStart.bottom - 6);
    await demo.mouse.down();
    await demo.mouse.move(resizeStart.right + 90, resizeStart.bottom + 40, { steps: 6 });
    await demo.mouse.up();
    const resized = await shadow(
      demo,
      "(() => { const r = root.querySelector('.lili-panel').getBoundingClientRect(); return { width: r.width, height: r.height }; })()"
    );
    check(
      'panneau : redimensionnable',
      resized.width > resizeStart.width + 80 && resized.height > resizeStart.height + 30,
      JSON.stringify({ resizeStart, resized })
    );

    await demo.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await sleep(150);
    await shot(demo, '03b-panel-translate-dark');
    await demo.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

    const replaceVisible = await shadow(demo, "!root.querySelector('[data-ui=\"replace\"]').hidden");
    check('remplacement : bouton proposé dans un champ', replaceVisible);

    await clickUi(demo, 'replace');
    await demo.waitForFunction(
      () => {
        const root = document.getElementById('lili-root')?.shadowRoot;
        return !!root?.querySelector('.lili-diff');
      },
      { timeout: 5000 }
    );
    const diffText = await shadow(demo, "root.querySelector('.lili-diff').textContent");
    check('remplacement : diff affiché', diffText.includes('translated version'), diffText.slice(0, 80));

    await clickUi(demo, 'confirm');
    await sleep(250);
    const fieldValue = await demo.$eval('#field', (el) => el.value);
    check('remplacement : valeur du textarea mise à jour', fieldValue === TRANSLATION, fieldValue);

    // 2. Reformuler dans un contenteditable
    await selectElement(demo, 'editable');
    await waitBar(demo);
    await clickAction(demo, 'rephrase');
    await waitResult(demo);
    const rephrased = await panelText(demo);
    check('reformulation : contenu reçu', rephrased.includes('reformulation claire'), rephrased);

    await clickUi(demo, 'replace');
    await demo.waitForFunction(
      () => {
        const root = document.getElementById('lili-root')?.shadowRoot;
        return !!root?.querySelector('.lili-diff');
      },
      { timeout: 5000 }
    );
    await clickUi(demo, 'confirm');
    await sleep(250);
    const editableText = await demo.$eval('#editable', (el) => el.innerText.trim());
    check(
      'remplacement : contenteditable mis à jour',
      editableText === 'Ceci est une reformulation claire et fluide du passage sélectionné.',
      editableText
    );

    // 3. Rich selection: formatting is captured, rendered and inserted back
    await selectElement(demo, 'rich');
    await waitBar(demo);
    await clickAction(demo, 'translate');
    await waitResult(demo);

    const richRendered = await shadow(demo, `(() => {
      const text = root.querySelector('.lili-text');
      return {
        strong: text.querySelectorAll('strong').length,
        items: text.querySelectorAll('ul li').length,
      };
    })()`);
    check(
      'formatage : Markdown capturé et rendu',
      richRendered.strong >= 1 && richRendered.items >= 2,
      JSON.stringify(richRendered)
    );

    await clickUi(demo, 'replace');
    await demo.waitForFunction(
      () => !!document.getElementById('lili-root')?.shadowRoot?.querySelector('.lili-diff'),
      { timeout: 5000 }
    );
    await clickUi(demo, 'confirm');
    await sleep(300);

    const richInserted = await demo.evaluate(() => {
      const element = document.getElementById('rich');
      return {
        strong: element.querySelectorAll('strong').length,
        items: element.querySelectorAll('ul li').length,
      };
    });
    check(
      'formatage : remplacement riche dans contenteditable',
      richInserted.strong >= 1 && richInserted.items >= 2,
      JSON.stringify(richInserted)
    );

    // 4. Keyboard fallback (page-level listener)
    await selectElement(demo, 'editable');
    await waitBar(demo);
    await demo.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'u',
          code: 'KeyU',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await waitResult(demo);
    const shortcutResult = await panelText(demo);
    check('raccourcis : fallback dans la page', shortcutResult.includes('reformulation claire'), shortcutResult);
    await clickUi(demo, 'close');

    // 5. Résumé de sélection
    await selectElement(demo, 'editable');
    await waitBar(demo);
    await clickAction(demo, 'summarize');
    await waitResult(demo);
    const summary = await panelText(demo);
    check('résumé : routage vers la connexion résumé', summary.includes('SUMMARY-FROM-B'), summary.slice(0, 80));
    check('résumé de sélection : puces reçues', summary.includes('Il conserve les chiffres'), summary);
    check('résumé : pas de bouton remplacer', !(await shadow(demo, "!root.querySelector('[data-ui=\"replace\"]').hidden")));

    // 6. Résumé de page (map-reduce)
    await selectElement(demo, 'editable');
    await waitBar(demo);
    await clickAction(demo, 'summarize_page');
    await waitResult(demo);
    const pageSummary = await panelText(demo);
    check('résumé de page : synthèse reçue', pageSummary.includes('RÉSUMÉ DE LA PAGE'), pageSummary.slice(0, 120));
    check('résumé de page : sections traitées', /section/.test(await panelMeta(demo)), await panelMeta(demo));

    const markdownShape = await shadow(demo, `(() => {
      const text = root.querySelector('.lili-text');
      return {
        headings: text.querySelectorAll('h2').length,
        items: text.querySelectorAll('ul li').length,
        strong: text.querySelectorAll('strong').length,
      };
    })()`);
    check(
      'markdown : titres, listes et gras',
      markdownShape.headings >= 1 && markdownShape.items >= 3 && markdownShape.strong >= 1,
      JSON.stringify(markdownShape)
    );

    const geometry = await shadow(
      demo,
      "(() => { const r = root.querySelector('.lili-panel').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth }; })()"
    );
    check(
      'panneau : contenu dans le viewport',
      geometry.top >= 0 && geometry.bottom <= geometry.vh + 1 && geometry.left >= 0 && geometry.right <= geometry.vw + 1,
      JSON.stringify(geometry)
    );

    await shot(demo, '04-panel-page-summary');

    // 7. Follow-up actions
    await shadow(demo, "root.querySelector('[data-followup=\"refine_shorter\"]').click()");
    await waitResult(demo);
    const refined = await panelText(demo);
    check('suites : résultat affiné', refined.includes('REFINE-SHORTER'), refined);

    await shadow(demo, "root.querySelector('[data-ui=\"back\"]').click()");
    await sleep(150);
    const restored = await panelText(demo);
    check(
      'suites : retour au résultat précédent',
      restored.includes('RÉSUMÉ DE LA PAGE'),
      restored.slice(0, 80)
    );

    // 8. Stop a running generation
    await shadow(demo, "root.querySelector('[data-followup=\"refine_longer\"]').click()");
    await demo.waitForFunction(
      () => {
        const root = document.getElementById('lili-root')?.shadowRoot;
        return root?.querySelector('.lili-panel')?.classList.contains('is-streaming');
      },
      { timeout: 5000 }
    );
    await demo.waitForFunction(
      () => {
        const root = document.getElementById('lili-root')?.shadowRoot;
        return (root?.querySelector('.lili-text')?.textContent.length || 0) > 30;
      },
      { timeout: 5000 }
    );
    await clickUi(demo, 'stop');
    await sleep(200);
    const stoppedStatus = await shadow(demo, "root.querySelector('.lili-status-text').textContent");
    check('arrêt : génération stoppée', /arrêtée/i.test(stoppedStatus), stoppedStatus);
    check('arrêt : panneau conservé', !(await shadow(demo, "root.querySelector('.lili-panel').hidden")));

    // 9. History and favorites
    await sleep(400);
    await clickUi(demo, 'history');
    await demo.waitForFunction(
      () => {
        const root = document.getElementById('lili-root')?.shadowRoot;
        return (
          root &&
          !root.querySelector('.lili-history').hidden &&
          root.querySelectorAll('.lili-history-item').length > 0
        );
      },
      { timeout: 5000 }
    );
    const historyCount = await shadow(demo, "root.querySelectorAll('.lili-history-item').length");
    check('historique : résultats listés', historyCount > 0, String(historyCount));
    await sleep(300);
    await shot(demo, '07-history');

    await shadow(demo, "root.querySelector('.lili-history-item [data-history-fav]').click()");
    await sleep(300);
    const historyStar = await shadow(
      demo,
      "root.querySelector('.lili-history-item [data-history-fav]').textContent"
    );
    check('historique : favori enregistré', historyStar === '★', historyStar);

    await shadow(demo, "root.querySelector('.lili-history-item [data-history-open]').click()");
    await sleep(200);
    const historyText = await panelText(demo);
    check('historique : résultat réouvert', historyText.length > 10, historyText.slice(0, 60));
    await clickUi(demo, 'close');

    // 10. Selection context
    await options.evaluate(
      (settings) => new Promise((resolve) => chrome.storage.local.set({ settings }, resolve)),
      { ...SETTINGS, ui: { ...SETTINGS.ui, context: true } }
    );
    await sleep(400);
    await demo.evaluate(() => {
      const paragraph = document.getElementById('para');
      const range = document.createRange();
      range.setStart(paragraph.firstChild, 0);
      range.setEnd(paragraph.firstChild, 40);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await waitBar(demo);
    await clickAction(demo, 'rephrase');
    await waitResult(demo);
    const contextResult = await panelText(demo);
    check('contexte : paragraphe transmis', contextResult.startsWith('[CONTEXT]'), contextResult.slice(0, 60));
    await clickUi(demo, 'close');

    // 11. Direct mode
    await options.evaluate(
      (settings) => new Promise((resolve) => chrome.storage.local.set({ settings }, resolve)),
      { ...SETTINGS, ui: { ...SETTINGS.ui, directMode: true } }
    );
    await sleep(400);
    await demo.evaluate(() => {
      document.getElementById('field').value = 'Bonjour, ceci est un texte à traduire.';
    });
    await selectTextarea(demo, 'field');
    await waitBar(demo);
    await clickAction(demo, 'translate');
    await demo.waitForFunction(
      () =>
        document.getElementById('field').value ===
        'OVH-TRANSLATION[French->English]: This is the translated version of your text.',
      { timeout: 15000 }
    );
    const directPanelHidden = await shadow(demo, "root.querySelector('.lili-panel').hidden");
    check('mode direct : champ remplacé sans panneau', directPanelHidden);

    // 12. Remplacement automatique (option)
    await options.evaluate((settings) => {
      return new Promise((resolve) => chrome.storage.local.set({ settings }, resolve));
    }, { ...SETTINGS, ui: { ...SETTINGS.ui, autoReplace: true } });
    await sleep(400);

    await demo.evaluate(() => {
      document.getElementById('field').value = 'Bonjour, ceci est un texte à traduire.';
    });
    await selectTextarea(demo, 'field');
    await waitBar(demo);
    await clickAction(demo, 'translate');
    await demo.waitForFunction(
      () => document.getElementById('field').value === 'OVH-TRANSLATION[French->English]: This is the translated version of your text.',
      { timeout: 15000 }
    );
    await sleep(250);
    const autoValue = await demo.$eval('#field', (el) => el.value);
    const autoPanelHidden = await shadow(demo, "root.querySelector('.lili-panel').hidden");
    check('remplacement auto : champ mis à jour', autoValue === TRANSLATION, autoValue);
    check('remplacement auto : panneau refermé', autoPanelHidden);

    // 13. Site rules
    await options.evaluate(
      (settings) => new Promise((resolve) => chrome.storage.local.set({ settings }, resolve)),
      { ...SETTINGS, siteRules: { disabled: ['127.0.0.1'], targets: {} } }
    );
    await sleep(400);

    await selectTextarea(demo, 'field');
    await sleep(300);
    const siteBarHidden = await shadow(demo, "root.querySelector('.lili-bar').hidden");
    check('sites : barre désactivée sur le domaine', siteBarHidden);

    await options.evaluate(
      (settings) => new Promise((resolve) => chrome.storage.local.set({ settings }, resolve)),
      { ...SETTINGS, siteRules: { disabled: [], targets: { '127.0.0.1': 'fr' } } }
    );
    await sleep(400);

    await demo.evaluate(() => {
      document.getElementById('field').value = 'Hello, this is an English text.';
    });
    await selectTextarea(demo, 'field');
    await waitBar(demo);
    await clickAction(demo, 'translate');
    await waitResult(demo);
    const siteTargetResult = await panelText(demo);
    check(
      'sites : langue cible du domaine',
      siteTargetResult.startsWith('OVH-TRANSLATION[English->French]'),
      siteTargetResult
    );
    await clickUi(demo, 'close');

    // 14. Chemin d'erreur (API injoignable)
    await options.evaluate((settings) => {
      return new Promise((resolve) => chrome.storage.local.set({ settings }, resolve));
    }, (() => {
      const broken = JSON.parse(JSON.stringify(SETTINGS));
      broken.connections = broken.connections.map((connection) =>
        connection.id === 'ovh' ? { ...connection, baseUrl: 'http://127.0.0.1:8799/v1' } : connection
      );
      return broken;
    })());
    await sleep(400);

    await demo.evaluate(() => {
      document.getElementById('field').value = 'Bonjour, ceci est un texte à traduire.';
    });
    await selectTextarea(demo, 'field');
    await waitBar(demo);
    await clickAction(demo, 'translate');
    await demo.waitForFunction(
      () => {
        const error = document.getElementById('lili-root')?.shadowRoot?.querySelector('.lili-error');
        return error && !error.hidden;
      },
      { timeout: 15000 }
    );
    const friendlyError = await shadow(demo, "root.querySelector('.lili-error').textContent");
    console.log('ERREUR BRUTE:', JSON.stringify(friendlyError));
    check('erreur réseau : message explicite', /Impossible de joindre/.test(friendlyError), friendlyError);
    await sleep(300);
    await shot(demo, '06-panel-error');

    // on restaure les réglages de test
    await options.evaluate((settings) => {
      return new Promise((resolve) => chrome.storage.local.set({ settings }, resolve));
    }, SETTINGS);
    await sleep(300);
    await shadow(demo, "root.querySelector('[data-ui=\"close\"]')?.click()");

    // 7. Chemin popup : lecture de la sélection + envoi d'un texte libre
    await demo.bringToFront();
    await selectElement(demo, 'editable');
    await waitBar(demo);

    const worker = await sw.worker();
    const selectionFromTab = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return chrome.tabs.sendMessage(tab.id, { type: 'lili:get-selection' });
    });
    check(
      'popup : sélection récupérée via l’onglet',
      /reformulation/.test(selectionFromTab?.text || ''),
      JSON.stringify(selectionFromTab).slice(0, 90)
    );

    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await chrome.tabs.sendMessage(tab.id, {
        type: 'lili:run',
        action: 'translate',
        text: 'Texte collé depuis le popup.',
      });
    });
    await waitResult(demo);
    const popupResult = await panelText(demo);
    check('popup : texte libre traité dans la page', popupResult.includes('translated version'), popupResult);
    check(
      'popup : pas de remplacement pour un texte libre',
      !(await shadow(demo, "!root.querySelector('[data-ui=\"replace\"]').hidden"))
    );

    // 8. Fermeture par Échap
    await demo.keyboard.press('Escape');
    await sleep(150);
    const panelHidden = await shadow(demo, "root.querySelector('.lili-panel').hidden");
    check('panneau : fermé par Échap', panelHidden);

    // --- popup : rendu avec une sélection simulée ---
    try {
      const popup = await browser.newPage();
      await popup.setViewport({ width: 360, height: 640 });
      await popup.evaluateOnNewDocument(() => {
        const stub = (obj, key, value) => {
          try {
            Object.defineProperty(obj, key, { value, configurable: true, writable: true });
          } catch (error) {
            console.log('stub ' + key + ' impossible : ' + error.message);
          }
        };
        stub(chrome.tabs, 'query', () => Promise.resolve([{ id: 1 }]));
        stub(chrome.tabs, 'sendMessage', () =>
          Promise.resolve({
            text: 'Bonjour, ceci est une sélection de démonstration à traduire.',
            editable: true,
          })
        );
        stub(chrome.runtime, 'sendMessage', (message) => {
          if (message && message.type === 'lili:get-settings') {
            return Promise.resolve({
              connections: [{ id: 'mock', label: 'OpenAI', model: 'gpt-4o-mini' }],
              fallback: { connection: 'mock', model: '' },
            });
          }
          return Promise.resolve({ ok: true });
        });
      });
      await popup.goto(`chrome-extension://${extId}/popup/popup.html`, { waitUntil: 'networkidle0' });
      await sleep(300);
      const popupState = await popup.evaluate(() => ({
        provider: document.querySelector('#provider').textContent,
        preview: document.querySelector('#selection-preview').textContent.slice(0, 40),
        buttons: document.querySelectorAll('#selection-actions button').length,
        enabled: Array.from(document.querySelectorAll('#selection-actions button')).filter((b) => !b.disabled).length,
      }));
      check('popup : fournisseur affiché', /OpenAI/.test(popupState.provider), popupState.provider);
      check('popup : sélection reçue', popupState.preview.startsWith('Bonjour'), popupState.preview);
      check('popup : actions actives', popupState.buttons === 5 && popupState.enabled === 5, JSON.stringify(popupState));
      await shot(popup, '05-popup');
      await popup.close();
    } catch (error) {
      console.log('… popup non testée :', error.message);
    }

    // --- popup réel via l'API action (best effort) ---
    try {
      const worker = await sw.worker();
      await worker.evaluate(() => chrome.action.openPopup());
      await sleep(900);
      const popupTarget = browser
        .targets()
        .find((t) => t.type() === 'page' && t.url().includes('popup/popup.html'));
      if (popupTarget) {
        const popupPage = await popupTarget.page();
        await popupPage.setViewport({ width: 360, height: 620 });
        await shot(popupPage, '05-popup');
        check('popup : ouvert', true);
      } else {
        console.log('… popup non capturée (ouverture programmatique refusée)');
      }
    } catch (error) {
      console.log('… popup non testée :', error.message);
    }

    const relevantErrors = consoleErrors.filter((text) => !/Failed to load resource.*404/.test(text));
    check('aucune erreur console', relevantErrors.length === 0, relevantErrors.join(' | '));
  } catch (error) {
    console.error('\nERREUR :', error);
    results.push({ name: 'exécution', ok: false, detail: error.message });
  } finally {
    await browser.close().catch(() => {});
    await mocks.close().catch(() => {});
    if (!process.env.E2E_KEEP_TEMP) fs.rmSync(TEMP, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} vérifications OK`);
  if (failed.length) {
    console.log('Échecs :');
    for (const item of failed) console.log(' - ' + item.name + (item.detail ? ' → ' + item.detail : ''));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('E2E interrompu :', error);
  process.exit(1);
});
