import { randomBytes } from 'node:crypto';

declare const IntentIdBrand: unique symbol;
export type IntentId = string & { readonly [IntentIdBrand]: true };

const BASE32_ALPHABET = '0123456789abcdefghijklmnopqrstuv'; // 32 chars (Crockford-ish lowercase)

export function mintIntentId(): IntentId {
  const buf = randomBytes(16);
  let n = BigInt('0x' + buf.toString('hex'));
  let out = '';
  for (let i = 0; i < 26; i++) {
    out = BASE32_ALPHABET[Number(n & 31n)]! + out;
    n >>= 5n;
  }
  return ('int_' + out) as IntentId;
}
