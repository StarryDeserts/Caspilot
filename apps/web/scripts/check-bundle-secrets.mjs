import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const FORBIDDEN_SUBSTRINGS = [
  'CSPR_CLOUD_KEY',
  'PRIVATE_KEY',
  'FACILITATOR_SECRET',
  'MNEMONIC',
  'SEED_PHRASE',
];

export function scanFiles(files) {
  const violations = [];
  for (const f of files) {
    for (const p of FORBIDDEN_SUBSTRINGS) {
      if (f.text.includes(p)) violations.push({ path: f.path, pattern: p });
    }
  }
  return { violations };
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|css|html|json)$/.test(e)) out.push({ path: p, text: readFileSync(p, 'utf8') });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2] ?? '.next';
  const files = walk(target);
  const { violations } = scanFiles(files);
  if (violations.length) {
    console.error('Forbidden secrets found in client bundle:');
    for (const v of violations) console.error(`  ${v.path}: ${v.pattern}`);
    process.exit(1);
  }
  console.log(`Bundle clean (${files.length} files scanned)`);
}
