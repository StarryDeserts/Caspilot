import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Privileged secret NAMES that must never reach the client bundle.
export const FORBIDDEN_SUBSTRINGS = [
  'CSPR_CLOUD_KEY',
  'PRIVATE_KEY',
  'FACILITATOR_SECRET',
  'MNEMONIC',
  'SEED_PHRASE',
];

// A privileged secret NAME is dangerous in three shapes: an assignment that
// carries a value (`NAME=...` / `"NAME":...`), a `process.env.NAME` read, and
// a bracket access `obj["NAME"]`. We deliberately do NOT flag a bare quoted
// mention (e.g. `new Set(["CSPR_CLOUD_KEY", ...])`) because the frontend
// redaction denylist legitimately names the keys it strips — that is a
// defense, not a leak.
function namedLeakRe(name) {
  return new RegExp(
    `${name}["']?\\s*[:=]` + // NAME= / "NAME":value
      `|process\\.env\\.${name}\\b` + // process.env.NAME
      `|process\\.env\\[\\s*["']${name}["']\\s*\\]` + // process.env["NAME"]
      `|\\[\\s*["']${name}["']\\s*\\]`, // obj["NAME"]
  );
}

// Strongest layer, independent of how a secret is named: if a *real* secret
// value (read from the environment at scan time) appears literally in the
// bundle, that is an unambiguous leak no matter the shape — DefinePlugin
// inlining, accidental serialization, minified bracket access, etc. A no-op
// when the privileged vars are unset, so it never produces false positives.
function readSecretValues() {
  return FORBIDDEN_SUBSTRINGS.map((n) => process.env[n]).filter(
    (v) => typeof v === 'string' && v.length >= 8,
  );
}

export function scanFiles(files, secretValues = readSecretValues()) {
  const violations = [];
  for (const f of files) {
    for (const p of FORBIDDEN_SUBSTRINGS) {
      if (namedLeakRe(p).test(f.text)) violations.push({ path: f.path, pattern: p });
    }
    for (const v of secretValues) {
      if (f.text.includes(v)) violations.push({ path: f.path, pattern: 'SECRET_VALUE' });
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
