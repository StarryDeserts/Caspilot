import { type PaymentPayload, PaymentPayloadSchema } from './schemas/payment-payload.schema.js';

/**
 * Transport header carrying the base64url-encoded x402 PaymentPayload.
 * §3B.0 LOCKED: base64url, no padding.
 */
export const X402_HEADER = 'PAYMENT-SIGNATURE' as const;

export function encodePaymentSignatureHeader(payload: PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodePaymentSignatureHeader(headerValue: string): PaymentPayload {
  const json = Buffer.from(headerValue, 'base64url').toString('utf8');
  return PaymentPayloadSchema.parse(JSON.parse(json));
}

export type SafeDecodeResult =
  | { ok: true; payload: PaymentPayload }
  | { ok: false; reason: 'invalid_payload' };

export function safeDecodePaymentSignatureHeader(headerValue: string): SafeDecodeResult {
  try {
    return { ok: true, payload: decodePaymentSignatureHeader(headerValue) };
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }
}

export interface PaymentSignatureHeaderCodec {
  encode(payload: PaymentPayload): string;
  decode(headerValue: string): PaymentPayload;
  safeDecode(headerValue: string): SafeDecodeResult;
}

export const paymentSignatureHeaderCodec: PaymentSignatureHeaderCodec = {
  encode: encodePaymentSignatureHeader,
  decode: decodePaymentSignatureHeader,
  safeDecode: safeDecodePaymentSignatureHeader,
};
