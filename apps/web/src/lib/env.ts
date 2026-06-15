import { z } from 'zod';

export const FORBIDDEN_PUBLIC_KEYS = [
  'CSPR_CLOUD_KEY',
  'PRIVATE_KEY',
  'MNEMONIC',
  'SEED',
  'API_KEY',
  'FACILITATOR_SECRET',
];

const Schema = z.object({
  NEXT_PUBLIC_CASPILOT_API_BASE: z.string().url(),
  NEXT_PUBLIC_CASPER_NETWORK: z.string().min(1),
});

export type PublicEnv = z.infer<typeof Schema>;

export function validatePublicEnv(input: Record<string, string | undefined>): PublicEnv {
  for (const key of Object.keys(input)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    for (const bad of FORBIDDEN_PUBLIC_KEYS) {
      if (key.includes(bad)) {
        throw new Error(
          `Forbidden public env key: ${key} — privileged secrets must never be bundled to the browser`,
        );
      }
    }
  }
  return Schema.parse(input);
}
