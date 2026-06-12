import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TierOneArtifactsSchema } from '../src/schema.js';

const samplePath = fileURLToPath(new URL('./fixtures/tier1-artifacts.sample.json', import.meta.url));
const load = () => JSON.parse(readFileSync(samplePath, 'utf8'));

describe('P6 acceptance', () => {
  it('sample tier1-artifacts.json validates against TierOneArtifactsSchema', () => {
    const parsed = TierOneArtifactsSchema.parse(load());
    expect(/^[0-9a-f]{64}$/.test(parsed.vault.contractHash)).toBe(true);
    expect(parsed.rejections.some((r) => r.kind === 'receiver_not_allowed')).toBe(true);
    expect(parsed.paySuccess.finalizedHeight).toBeGreaterThan(0);
  });

  it('records the real on-chain rejection codes (ReceiverNotAllowed=3, AmountAboveMax=4)', () => {
    const parsed = TierOneArtifactsSchema.parse(load());
    const receiver = parsed.rejections.find((r) => r.kind === 'receiver_not_allowed');
    const overMax = parsed.rejections.find((r) => r.kind === 'over_max_single_payment');
    expect(receiver?.errorCode).toBe(3);
    expect(overMax?.errorCode).toBe(4);
  });

  it('demo tier 1 requires at least one rejection (regression guard)', () => {
    const json = load();
    json.rejections = [];
    expect(() => TierOneArtifactsSchema.parse(json)).toThrow();
  });
});
