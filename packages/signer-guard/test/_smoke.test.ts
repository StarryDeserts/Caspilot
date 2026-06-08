import { describe, expect, it } from 'vitest';
import { SIGNER_ROLES } from '@caspilot/signer-guard';

describe('SIGNER_ROLES', () => {
  it('declares the three separated signer roles', () => {
    expect(SIGNER_ROLES).toEqual(['user_cspr_click', 'local_dev', 'demo_sponsored']);
  });
});
