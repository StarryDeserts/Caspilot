import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const FORBIDDEN_SUBSTRINGS = [
  'CSPR_CLOUD_KEY',
  'PRIVATE_KEY',
  'FACILITATOR_SECRET',
  'MNEMONIC',
  'SEED_PHRASE',
];

// A privileged secret NAME is only a leak when it carries a value
// (`NAME=...` or `"NAME":...`). A bare quoted occurrence — e.g. a
// redaction denylist that legitimately lists the keys it strips —
// is a defense, not a leak, so it must not trip the gate.
function assignmentRe(name) {
  return new RegExp(`${name}["']?\\s*[:=]`);
}

export function scanFiles(files) {
  const violations = [];
  for (const f of files) {
    for (const p of FORBIDDEN_SUBSTRINGS) {
      if (assignmentRe(p).test(f.text)) violations.push({ path: f.path, pattern: p });
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
