import { describe, expect, it } from 'vitest';
import {
  X402_HEADER,
  decodePaymentSignatureHeader,
  encodePaymentSignatureHeader,
  paymentSignatureHeaderCodec,
  safeDecodePaymentSignatureHeader,
} from '../src/header.js';
import { PaymentPayloadSchema } from '../src/schemas/payment-payload.schema.js';

import verifyRequest from '../__fixtures__/verify-request.exact-casper.json' with { type: 'json' };

const payload = PaymentPayloadSchema.parse(verifyRequest.paymentPayload);

describe('PAYMENT-SIGNATURE header codec (§3B.0)', () => {
  it('exposes the locked header name', () => {
    expect(X402_HEADER).toBe('PAYMENT-SIGNATURE');
  });

  it('round-trips a valid payload', () => {
    const encoded = encodePaymentSignatureHeader(payload);
    expect(decodePaymentSignatureHeader(encoded)).toEqual(payload);
  });

  it('encodes base64url with no padding and no + or / characters', () => {
    const encoded = encodePaymentSignatureHeader(payload);
    expect(encoded).not.toMatch(/=/);
    expect(encoded).not.toMatch(/[+/]/);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('decode throws on malformed base64 input', () => {
    expect(() => decodePaymentSignatureHeader('!!!')).toThrow();
  });

  it('decode throws on valid base64url that is not JSON', () => {
    const notJson = Buffer.from('hello world', 'utf8').toString('base64url');
    expect(() => decodePaymentSignatureHeader(notJson)).toThrow();
  });

  it('decode throws on valid JSON with the wrong shape (schema mismatch)', () => {
    const wrongShape = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64url');
    expect(() => decodePaymentSignatureHeader(wrongShape)).toThrow();
  });

  it('safeDecode returns ok:true with the payload for valid input', () => {
    const encoded = encodePaymentSignatureHeader(payload);
    const result = safeDecodePaymentSignatureHeader(encoded);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toEqual(payload);
  });

  it('safeDecode returns ok:false invalid_payload for malformed base64', () => {
    const result = safeDecodePaymentSignatureHeader('!!!');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_payload');
  });

  it('safeDecode returns ok:false invalid_payload for schema mismatch', () => {
    const wrongShape = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64url');
    const result = safeDecodePaymentSignatureHeader(wrongShape);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_payload');
  });

  it('extracts the payload from the official verify-request fixture', () => {
    const encoded = encodePaymentSignatureHeader(payload);
    const decoded = decodePaymentSignatureHeader(encoded);
    expect(decoded.payload.authorization.from).toBe(
      verifyRequest.paymentPayload.payload.authorization.from,
    );
    expect(decoded.scheme).toBe('exact');
    expect(decoded.network).toBe('casper:casper-test');
  });

  it('codec object delegates to the standalone functions', () => {
    const encoded = paymentSignatureHeaderCodec.encode(payload);
    expect(paymentSignatureHeaderCodec.decode(encoded)).toEqual(payload);
    expect(paymentSignatureHeaderCodec.safeDecode(encoded).ok).toBe(true);
  });
});
