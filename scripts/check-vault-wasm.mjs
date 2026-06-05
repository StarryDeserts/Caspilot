import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const artifactUrl = new URL('../contracts/policy-vault/wasm/PolicyVault.wasm', import.meta.url);
const artifactPath = fileURLToPath(artifactUrl);
const minSize = 50_000;
const maxSize = 1_200_000;
const wasmMagic = [0x00, 0x61, 0x73, 0x6d];

function fail(message) {
  console.error(`PolicyVault WASM smoke check failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(artifactUrl)) {
  fail(`missing artifact at ${artifactPath}`);
}

const { size } = fs.statSync(artifactUrl);
if (size < minSize || size > maxSize) {
  fail(
    `artifact size ${size} bytes outside expected range ${minSize}-${maxSize} bytes at ${artifactPath}`,
  );
}

const artifact = fs.readFileSync(artifactUrl);
const hasWasmMagic = wasmMagic.every((byte, index) => artifact[index] === byte);
if (!hasWasmMagic) {
  fail(`artifact does not start with WASM magic bytes at ${artifactPath}`);
}

console.log(`ok size=${size}`);
