// Set the same version in package.json and src/manifest.base.json.

import { readFileSync, writeFileSync } from 'node:fs';

const version = String(process.argv[2] || '').trim();

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: npm run version:set -- 0.3.1');
  process.exit(1);
}

for (const file of ['package.json', 'src/manifest.base.json']) {
  const url = new URL('../' + file, import.meta.url);
  const text = readFileSync(url, 'utf8');
  const updated = text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);

  if (updated === text) {
    console.log(`= ${file} already ${version}`);
    continue;
  }

  // Fail on a malformed result rather than writing a broken manifest.
  JSON.parse(updated);
  writeFileSync(url, updated);
  console.log(`✓ ${file} → ${version}`);
}
