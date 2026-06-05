import fs from 'node:fs';
import path from 'node:path';

const base = JSON.parse(fs.readFileSync(path.resolve('tsconfig.base.json'), 'utf8'));
const opts = base.compilerOptions ?? {};
const required = {
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitOverride: true,
  isolatedModules: true,
  module: 'NodeNext',
  moduleResolution: 'NodeNext',
  target: 'ES2022',
};
const failures = Object.entries(required).filter(([k, v]) => opts[k] !== v);
if (failures.length) {
  console.error('strict tsconfig violations:', failures);
  process.exit(1);
}
console.log('ok');
