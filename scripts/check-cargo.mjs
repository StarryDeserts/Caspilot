import { execSync } from 'node:child_process';

const contractDir = new URL('../contracts/policy-vault/', import.meta.url);
const binDir = new URL('../node_modules/.bin/', import.meta.url);
const options = {
  cwd: contractDir,
  env: {
    ...process.env,
    CARGO_TARGET_DIR: 'target',
    PATH: `${binDir.pathname}:${process.env.PATH ?? ''}`,
  },
  stdio: 'inherit',
};

try {
  execSync('cargo odra test -b casper', options);
  execSync('cargo odra build', options);
} catch {
  console.error('cargo-odra policy_vault check failed');
  process.exit(1);
}
