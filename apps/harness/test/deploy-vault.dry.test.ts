import { describe, it, expect } from 'vitest';
import { buildDeployVaultPlan } from '../scripts/deploy-vault.js';

describe('deploy-vault plan', () => {
  it('returns dry plan when RUN_REAL_ONCHAIN is unset', () => {
    const plan = buildDeployVaultPlan({
      env: {
        CASPER_NODE_RPC: 'http://node:7777/rpc',
        CASPER_CHAINSPEC: 'casper-test',
        VAULT_WASM_PATH: '/tmp/vault.wasm',
        LOCAL_SIGNER_PRIVATE_KEY_PATH: '/tmp/key.pem',
      },
      now: () => 1_700_000_000_000,
    });
    expect(plan.mode).toBe('dry');
    expect(plan.rpc).toBe('http://node:7777/rpc');
    expect(plan.expectedChainspec).toBe('casper-test');
  });

  it('refuses to build a real plan if VAULT_WASM_PATH is missing', () => {
    expect(() =>
      buildDeployVaultPlan({
        env: {
          CASPER_NODE_RPC: 'x',
          CASPER_CHAINSPEC: 'casper-test',
          LOCAL_SIGNER_PRIVATE_KEY_PATH: '/tmp/k',
          RUN_REAL_ONCHAIN: '1',
        },
        now: () => 0,
      }),
    ).toThrow(/VAULT_WASM_PATH/);
  });
});
