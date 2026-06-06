import { z } from 'zod';

export const X402ErrorReasonSchema = z.enum([
  'invalid_payload',
  'invalid_scheme',
  'invalid_network',
  'invalid_asset',
  'invalid_amount',
  'expired',
  'insufficient_funds',
  'replay_detected',
  'signature_invalid',
  'unsupported_kind',
  'facilitator_unavailable',
]);
export type X402ErrorReason = z.infer<typeof X402ErrorReasonSchema>;
