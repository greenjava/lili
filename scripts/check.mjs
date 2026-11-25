// Fast static checks: JS syntax and manifest references.
// Usage: node scripts/check.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(root, 'src');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = [
  ...walk(srcDir),
  ...walk(path.join(root, 'scripts')),
  ...walk(path.join(root, 'test', 'e2e')),
];
let failed = 0;

for (const file of files.filter((f) => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failed++;
    console.error(`✗ syntax ${path.relative(root, file)}`);
    console.error(String(error.stderr || error.message));
  }
}

for (const file of files.filter((f) => f.endsWith('.json'))) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    failed++;
    console.error(`✗ JSON ${path.relative(root, file)} : ${error.message}`);
  }
}

// i18n: both locales must expose the same keys and placeholders, and every
// key referenced from the source must exist.
const localeDir = path.join(srcDir, '_locales');
const locales = {};
for (const lang of ['en', 'fr']) {
  const file = path.join(localeDir, lang, 'messages.json');
  try {
    locales[lang] = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    failed++;
    console.error(`✗ locales ${lang} : ${error.message}`);
    locales[lang] = {};
  }
}

const enKeys = Object.keys(locales.en).sort();
const frKeys = Object.keys(locales.fr).sort();
for (const key of enKeys) {
  if (!(key in locales.fr)) {
    failed++;
    console.error(`✗ locales : ${key} missing from fr`);
  }
}
for (const key of frKeys) {
  if (!(key in locales.en)) {
    failed++;
    console.error(`✗ locales : ${key} missing from en`);
  }
}
for (const key of enKeys) {
  const a = Object.keys(locales.en[key].placeholders || {}).sort().join(',');
  const b = Object.keys((locales.fr[key] || {}).placeholders || {}).sort().join(',');
  if (a !== b) {
    failed++;
    console.error(`✗ locales : placeholders differ for ${key} (en: ${a || 'none'}, fr: ${b || 'none'})`);
  }
}

const referenced = new Set();
const staticFiles = files.filter((f) => /\.(js|html)$/.test(f));
for (const file of staticFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/data-i18n(?:-[a-z-]+)?="([A-Za-z0-9_]+)"/g)) {
    referenced.add(match[1]);
  }
  for (const match of text.matchAll(/(?:^|[^A-Za-z0-9_])t\('([A-Za-z0-9_]+)'/g)) {
    referenced.add(match[1]);
  }
  for (const match of text.matchAll(/(?:label|short|hint)Key: '([A-Za-z0-9_]+)'/g)) {
    referenced.add(match[1]);
  }
}
for (const key of [...referenced].sort()) {
  // Keys ending in "_" are dynamic prefixes such as language_.
  if (key.endsWith('_')) continue;
  if (!(key in locales.en)) {
    failed++;
    console.error(`✗ locales : key ${key} used but missing from messages.json`);
  }
}

console.log(failed ? `\n${failed} error(s).` : `OK — ${files.length} files checked.`);
process.exit(failed ? 1 : 0);
