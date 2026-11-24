// Ensure package.json, manifest.base.json and an optional tag share one version.

import { readFileSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(new URL('../' + name, import.meta.url), 'utf8'));

const pkg = read('package.json');
const manifest = read('src/manifest.base.json');
const tag = (process.env.GITHUB_REF_NAME || process.argv[2] || '').replace(/^v/, '');

const errors = [];

if (pkg.version !== manifest.version) {
  errors.push(`package.json (${pkg.version}) and src/manifest.base.json (${manifest.version}) differ`);
}
if (tag && pkg.version !== tag) {
  errors.push(`package.json (${pkg.version}) and tag (${tag}) differ`);
}

if (errors.length) {
  for (const error of errors) console.error('✗ ' + error);
  process.exit(1);
}

console.log(`✓ version ${pkg.version}${tag ? ' (tag ' + tag + ')' : ''}`);
