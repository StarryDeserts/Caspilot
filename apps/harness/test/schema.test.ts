import { describe, it, expect } from 'vitest';
import { TierOneArtifactsSchema } from '../src/schema.js';

describe('TierOneArtifactsSchema', () => {
  it('requires deployVaultHash + paySuccessHash + at least one rejection record', () => {
    const ok = TierOneArtifactsSchema.parse({
      generatedAtMs: Date.now(),
      network: 'casper-test',
      chainspec: 'casper-test',
      vault: {
        contractHash: 'aa'.repeat(32),
        deployHash: 'bb'.repeat(32),
        finalizedHeight: 1_000_000,
      },
      paySuccess: {
        deployHash: 'cc'.repeat(32),
        amount: '100',
        receiver: `00${'dd'.repeat(32)}`,
        finalizedHeight: 1_000_001,
      },
      rejections: [
        {
          kind: 'receiver_not_allowed',
          deployHash: 'ee'.repeat(32),
          errorCode: 3,
          finalizedHeight: 1_000_002,
        },
      ],
    });
    expect(ok.rejections.length).toBe(1);
  });

  it('refuses zero rejections', () => {
    expect(() =>
      TierOneArtifactsSchema.parse({
        generatedAtMs: 0,
        network: 'casper-test',
        chainspec: 'casper-test',
        vault: { contractHash: 'aa'.repeat(32), deployHash: 'bb'.repeat(32), finalizedHeight: 1 },
        paySuccess: {
          deployHash: 'cc'.repeat(32),
          amount: '1',
          receiver: `00${'dd'.repeat(32)}`,
          finalizedHeight: 2,
        },
        rejections: [],
      }),
    ).toThrow();
  });
});
