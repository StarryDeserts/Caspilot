import { describe, it, expect } from 'vitest';
import { assembleTier1Artifacts } from '../scripts/dump-tier1-artifacts.js';
import { TierOneArtifactsSchema } from '../src/schema.js';

const VAULT = { contractHash: `00${'aa'.repeat(32)}`, deployHash: 'bb'.repeat(32), finalizedHeight: 1 };
const PAY = { deployHash: 'cc'.repeat(32), amount: '50', receiver: `00${'cc'.repeat(32)}`, finalizedHeight: 2 };

describe('assembleTier1Artifacts', () => {
  it('packs vault + paySuccess + rejections into a valid TierOneArtifacts', () => {
    const out = assembleTier1Artifacts({
      now: 1_700_000_000_000,
      network: 'casper-test',
      chainspec: 'casper-test',
      vault: VAULT,
      paySuccess: PAY,
      rejections: [
        { kind: 'receiver_not_allowed', deployHash: 'dd'.repeat(32), errorCode: 3, finalizedHeight: 3 },
        { kind: 'over_max_single_payment', deployHash: 'ee'.repeat(32), errorCode: 4, finalizedHeight: 4 },
      ],
    });
    expect(() => TierOneArtifactsSchema.parse(out)).not.toThrow();
    expect(out.rejections.length).toBe(2);
  });

  it('refuses to assemble if rejections is empty', () => {
    expect(() =>
      assembleTier1Artifacts({
        now: 0,
        network: 'casper-test',
        chainspec: 'casper-test',
        vault: VAULT,
        paySuccess: PAY,
        rejections: [],
      }),
    ).toThrow();
  });

  it('refuses if chainspec mismatches the network root', () => {
    expect(() =>
      assembleTier1Artifacts({
        now: 0,
        network: 'casper',
        chainspec: 'casper-test',
        vault: VAULT,
        paySuccess: PAY,
        rejections: [{ kind: 'receiver_not_allowed', deployHash: 'dd'.repeat(32), errorCode: 3, finalizedHeight: 3 }],
      }),
    ).toThrow(/chainspec/);
  });
});
