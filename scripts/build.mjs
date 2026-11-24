// Build dist/chrome and dist/firefox from src/.
// One source, two manifests. No npm dependencies.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');
const wantZip = process.argv.includes('--zip');

const base = JSON.parse(readFileSync(path.join(srcDir, 'manifest.base.json'), 'utf8'));

const TARGETS = {
  chrome: JSON.parse(readFileSync(path.join(srcDir, 'manifest.chrome.json'), 'utf8')),
  firefox: JSON.parse(readFileSync(path.join(srcDir, 'manifest.firefox.json'), 'utf8')),
};

/** Recursively copy src/ to dist/<target>/, skipping manifests. */
function copySources(dest) {
  for (const entry of readdirSync(srcDir)) {
    if (entry.startsWith('manifest.') && entry.endsWith('.json')) continue;
    cpSync(path.join(srcDir, entry), path.join(dest, entry), { recursive: true });
  }
}

/** Check that every file referenced by the manifest exists. */
function verify(dest, manifest) {
  const missing = [];
  const check = (rel) => {
    if (typeof rel !== 'string') return;
    const file = path.join(dest, rel);
    if (!existsSync(file) || !statSync(file).isFile()) missing.push(rel);
  };
  Object.values(manifest.icons || {}).forEach(check);
  Object.values(manifest.action?.default_icon || {}).forEach(check);
  check(manifest.action?.default_popup);
  check(manifest.options_ui?.page);
  for (const cs of manifest.content_scripts || []) (cs.js || []).forEach(check);
  if (manifest.background?.service_worker) check(manifest.background.service_worker);
  (manifest.background?.scripts || []).forEach(check);
  return missing;
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const [name, override] of Object.entries(TARGETS)) {
  const dest = path.join(distDir, name);
  mkdirSync(dest, { recursive: true });
  copySources(dest);

  const manifest = { ...base, ...override };
  writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const missing = verify(dest, manifest);
  if (missing.length) {
    console.error(`✗ ${name}: missing files → ${missing.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ dist/${name}/manifest.json (${Object.keys(override).join(', ')})`);
  }

  if (wantZip) {
    const out = path.join(distDir, `lili-${name}.zip`);
    rmSync(out, { force: true });
    execFileSync('zip', ['-r', '-q', out, '.'], { cwd: dest });
    console.log(`✓ dist/lili-${name}.zip`);
  }
}

console.log('\nLoad the extension:');
console.log('  Chrome  → chrome://extensions → Developer mode → "Load unpacked" → dist/chrome');
console.log('  Firefox → about:debugging#/runtime/this-firefox → "Load Temporary Add-on" → dist/firefox/manifest.json');
