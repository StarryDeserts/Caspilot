import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const wf = yaml.load(fs.readFileSync(path.resolve('pnpm-workspace.yaml'), 'utf8'));
const required = ['packages/*', 'apps/*'];
const missing = required.filter((p) => !wf.packages?.includes(p));
if (missing.length) {
  console.error('workspace globs missing:', missing.join(', '));
  process.exit(1);
}
console.log('ok');
