// Two fake OpenAI-compatible providers for the end-to-end test.
// Ports are dynamic; one provider answers summaries, the other everything else.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.join(HERE, 'demo.html');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK = {
  translate: 'This is the translated version of your text.',
  rephrase: 'Ceci est une reformulation claire et fluide du passage sélectionné.',
  rephraseTranslate: 'This is a reformulated and translated version.',
  fix: 'Texte corrigé, sans faute.',
  summarize:
    'SUMMARY-FROM-B\n' +
    'Le passage présente une idée simple : le résumé doit rester fidèle, court et factuel.\n' +
    '- Il conserve les chiffres et les noms.\n' +
    '- Il supprime les répétitions.\n' +
    '- Il n’ajoute aucune information.',
  page:
    'SUMMARY-FROM-B\n' +
    'RÉSUMÉ DE LA PAGE\n' +
    'Cette page de démonstration sert à valider le résumé automatique.\n\n' +
    '- Elle contient plusieurs sections pour déclencher le traitement par morceaux.\n' +
    '- Le modèle factice renvoie des notes intermédiaires, puis une synthèse.\n' +
    '- Le résultat s’affiche dans le panneau flottant.\n\n' +
    'À retenir : le flux complet fonctionne, du clic jusqu’au panneau.',
  notes: '- Note factuelle : le texte décrit une procédure de test.\n- Chiffre clé : 42.',
  test: 'OK',
};

function pickKind(system, flavor) {
  if (flavor === 'summary') {
    if (/Tu prépares des notes de lecture/i.test(system)) return 'notes';
    if (/Tu rédiges le résumé final/i.test(system)) return 'page';
    if (/Tu résumes «/i.test(system)) return 'page';
    return 'summarize';
  }
  if (/Tu es un test de connexion/i.test(system)) return 'test';
  if (/Tu es un traducteur professionnel/i.test(system)) return 'translate';
  if (/Tu es un éditeur exigeant/i.test(system)) return 'rephrase';
  if (/Reformule puis traduis/i.test(system)) return 'rephraseTranslate';
  if (/Corrige le texte fourni/i.test(system)) return 'fix';
  if (/Tu résumes un texte pour un lecteur pressé/i.test(system)) return 'summarize';
  if (/Tu prépares des notes de lecture/i.test(system)) return 'notes';
  if (/Tu rédiges le résumé final/i.test(system)) return 'page';
  return 'translate';
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
}

function handler(flavor) {
  return async (req, res) => {
    cors(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    if (req.method === 'GET' && req.url.includes('/models')) {
      // OVHcloud behaviour: the catalog is public but rejects a bad token.
      if (req.headers.authorization) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Forbidden: authentication failed.' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: [
            { id: 'mock-1', context_length: 32000 },
            { id: 'mock-fast', context_length: 32000 },
            { id: 'mock-smart', context_length: 32000 },
            { id: 'bge-m3', context_length: 8192 },
            { id: 'whisper-large-v3', context_length: 0 },
            { id: 'nvr-tts-en-us', context_length: 0 },
          ],
        })
      );
      return;
    }

    if (req.method !== 'POST' || !req.url.includes('/chat/completions')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;

    let payload = {};
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400).end('bad json');
      return;
    }

    const messages = payload.messages || [];
    const system = (messages.find((m) => m.role === 'system') || {}).content || '';
    const user = (messages.find((m) => m.role === 'user') || {}).content || '';

    let text = MOCK[pickKind(system, flavor)] || MOCK.translate;

    // OVHcloud Olala translate style: required language fields, user message only.
    if (payload.source_language || payload.target_language) {
      if (!payload.source_language || !payload.target_language) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: { message: 'source_language and target_language are required' } })
        );
        return;
      }
      if (system) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'system messages are not supported' } }));
        return;
      }
      text = `OVH-TRANSLATION[${payload.source_language}->${payload.target_language}]: ${MOCK.translate}`;
      console.log(`[mock:${flavor}] ovh-translate ${payload.source_language}->${payload.target_language}`);
    } else {
      console.log(`[mock:${flavor}] ${pickKind(system, flavor)} · stream=${!!payload.stream}`);
    }

    if (!payload.stream) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const step = 28;
    for (let i = 0; i < text.length; i += step) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + step) } }] })}\n\n`);
      await sleep(12);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  };
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

export async function startMocks() {
  const general = http.createServer(handler('general'));
  const summary = http.createServer(handler('summary'));
  const web = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/demo')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(DEMO));
      return;
    }
    res.writeHead(404).end('not found');
  });

  const [generalPort, summaryPort, webPort] = await Promise.all([
    listen(general),
    listen(summary),
    listen(web),
  ]);

  const origin = (port) => `http://127.0.0.1:${port}`;

  return {
    generalUrl: origin(generalPort) + '/v1',
    summaryUrl: origin(summaryPort) + '/v1',
    demoUrl: origin(webPort) + '/demo.html',
    origins: [origin(generalPort) + '/*', origin(summaryPort) + '/*'],
    close: () =>
      Promise.all(
        [general, summary, web].map((server) => new Promise((resolve) => server.close(resolve)))
      ),
  };
}
