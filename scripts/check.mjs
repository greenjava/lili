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

console.log(failed ? `\n${failed} error(s).` : `OK — ${files.length} files checked.`);
process.exit(failed ? 1 : 0);
