import { describe, it, expect } from 'vitest';
import { CapabilityReport, summarizeCapability, BootGate } from '../src/capability.js';

describe('CapabilityReport', () => {
  const ok = {
    db: { ok: true },
    chainStatus: [
      { name: 'casper-rpc', ok: true, chainspecName: 'casper-test' },
      { name: 'cspr-cloud', ok: false, reason: 'http_500' },
    ],
    observation: { ok: true },
    strategy: { ok: true },
    dex: { ok: true },
    submission: { ok: true },
  };

  it('parses with two chain_status entries', () => {
    expect(CapabilityReport.safeParse(ok).success).toBe(true);
  });

  it('summarizeCapability reports ≥1 chain ok', () => {
    const s = summarizeCapability(CapabilityReport.parse(ok));
    expect(s.chainStatusOkCount).toBe(1);
  });

  it('BootGate.canBoot true when db ok && ≥1 chain ok && chainspec match', () => {
    const r = BootGate({ report: CapabilityReport.parse(ok), expectedChainspec: 'casper-test' });
    expect(r.canBoot).toBe(true);
  });

  it('BootGate.canBoot false when chainspec mismatch', () => {
    const r = BootGate({ report: CapabilityReport.parse(ok), expectedChainspec: 'casper-mainnet' });
    expect(r.canBoot).toBe(false);
    expect(r.reasons).toContain('chainspec_mismatch');
  });

  it('BootGate.canBoot false when db not ok', () => {
    const broken = { ...ok, db: { ok: false, reason: 'sqlite_open_failed' } };
    const r = BootGate({
      report: CapabilityReport.parse(broken),
      expectedChainspec: 'casper-test',
    });
    expect(r.canBoot).toBe(false);
    expect(r.reasons).toContain('db_not_ok');
  });
});
