import { describe, it, expect, vi } from 'vitest';
import { ClickWallet, type ClickProvider } from '../src/lib/wallet.js';

describe('ClickWallet', () => {
  it('exposes connect / requestSignature using the provider only — never reads any API key', async () => {
    const provider: ClickProvider = {
      connect: vi.fn(async () => ({ publicKeyHex: '01' + 'ab'.repeat(32) })),
      signDeploy: vi.fn(async () => ({ signatureHex: 'aa'.repeat(65) })),
    };
    const w = new ClickWallet(provider);
    const acc = await w.connect();
    expect(acc.publicKeyHex.startsWith('01')).toBe(true);
    const sig = await w.signDeploy({ deployHashHex: 'cc'.repeat(32) });
    expect(sig.signatureHex.length).toBe(130);
  });

  it('throws helpful error when provider is missing', () => {
    expect(() => new ClickWallet(undefined as unknown as ClickProvider)).toThrow(/CSPR\.click/);
  });

  it('refuses to read any property that looks like CSPR_CLOUD_KEY', () => {
    const provider = { connect: async () => ({ publicKeyHex: '01' + 'ab'.repeat(32) }), signDeploy: async () => ({ signatureHex: 'aa'.repeat(65) }), CSPR_CLOUD_KEY: 'leaked' } as unknown as ClickProvider;
    expect(() => new ClickWallet(provider)).toThrow(/CSPR_CLOUD_KEY/);
  });
});
