import { canonicalSha256Hex } from '@caspilot/shared';
import type { SignerGuardPolicy } from './types.js';

export function computePolicyDigest(policy: SignerGuardPolicy): string {
  return canonicalSha256Hex(policy);
}
