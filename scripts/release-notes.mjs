// Extract the CHANGELOG section for the current tag into dist/release-notes.md.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const version = (process.env.GITHUB_REF_NAME || process.argv[2] || '').replace(/^v/, '').trim();

if (!version) {
  console.error('Usage: npm run release:notes -- v0.3.1');
  process.exit(1);
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const heading = changelog.match(new RegExp('^## \\[' + escaped + '\\][^\\n]*$', 'm'));

if (!heading) {
  console.error(`✗ no CHANGELOG section for ${version} (expected "## [${version}] ...")`);
  process.exit(1);
}

const rest = changelog.slice(heading.index + heading[0].length);
const next = rest.search(/^## \[/m);
const body = (next === -1 ? rest : rest.slice(0, next)).trim();

if (!body) {
  console.error(`✗ CHANGELOG section for ${version} is empty`);
  process.exit(1);
}

mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/release-notes.md', import.meta.url), body + '\n');
console.log(`✓ dist/release-notes.md (${version})`);
