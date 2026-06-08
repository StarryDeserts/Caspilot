import fs from 'node:fs';
import yaml from 'js-yaml';
const ci = yaml.load(fs.readFileSync('.github/workflows/ci.yml', 'utf8'));
const jobs = Object.keys(ci.jobs ?? {});
const required = ['typecheck', 'test', 'cargo_check', 'format_check'];
const missing = required.filter((j) => !jobs.includes(j));
if (missing.length) {
  console.error('missing CI jobs:', missing);
  process.exit(1);
}

const nonNode22Jobs = Object.entries(ci.jobs ?? {})
  .filter(([, job]) =>
    (job?.steps ?? []).some(
      (step) =>
        typeof step?.uses === 'string' &&
        step.uses.startsWith('actions/setup-node@') &&
        String(step.with?.['node-version']) !== '22',
    ),
  )
  .map(([job]) => job);
if (nonNode22Jobs.length) {
  console.error('CI setup-node jobs must use Node 22:', nonNode22Jobs);
  process.exit(1);
}

console.log('ok');
