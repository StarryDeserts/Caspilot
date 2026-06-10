import { describe, it, expect } from 'vitest';
import { runDoctor } from '../src/cli.js';

describe('adapter-doctor', () => {
  it('returns canBoot true when stubs all ok', async () => {
    const report = await runDoctor({
      expectedChainspec: 'casper-test',
      probes: {
        db: async () => ({ ok: true }),
        chainStatus: async () => [{ name: 'casper-rpc', ok: true, chainspecName: 'casper-test' }],
        observation: async () => ({ ok: true }),
        strategy: async () => ({ ok: true }),
        dex: async () => ({ ok: true }),
        submission: async () => ({ ok: true }),
      },
    });
    expect(report.canBoot).toBe(true);
  });

  it('returns canBoot false on chainspec mismatch with explanation', async () => {
    const report = await runDoctor({
      expectedChainspec: 'casper-test',
      probes: {
        db: async () => ({ ok: true }),
        chainStatus: async () => [
          { name: 'casper-rpc', ok: true, chainspecName: 'casper-mainnet' },
        ],
        observation: async () => ({ ok: true }),
        strategy: async () => ({ ok: true }),
        dex: async () => ({ ok: true }),
        submission: async () => ({ ok: true }),
      },
    });
    expect(report.canBoot).toBe(false);
    expect(report.reasons).toContain('chainspec_mismatch');
  });
});
