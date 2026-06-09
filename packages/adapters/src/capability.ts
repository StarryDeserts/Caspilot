import { z } from 'zod';

const Ok = z.object({ ok: z.literal(true) }).passthrough();
const Bad = z.object({ ok: z.literal(false), reason: z.string() }).passthrough();
const Status = z.union([Ok, Bad]);

export const ChainStatus = z.object({
  name: z.string(),
  ok: z.boolean(),
  chainspecName: z.string().optional(),
  reason: z.string().optional(),
});

export const CapabilityReport = z.object({
  db: Status,
  chainStatus: z.array(ChainStatus).min(1),
  observation: Status,
  strategy: Status,
  dex: Status,
  submission: Status,
});
export type CapabilityReport = z.infer<typeof CapabilityReport>;

export interface CapabilitySummary {
  chainStatusOkCount: number;
  dbOk: boolean;
}
export function summarizeCapability(r: CapabilityReport): CapabilitySummary {
  return {
    chainStatusOkCount: r.chainStatus.filter((s) => s.ok).length,
    dbOk: r.db.ok,
  };
}

export interface BootDecision {
  canBoot: boolean;
  reasons: string[];
}

export function BootGate(opts: {
  report: CapabilityReport;
  expectedChainspec: string;
}): BootDecision {
  const reasons: string[] = [];
  if (!opts.report.db.ok) reasons.push('db_not_ok');
  const okChains = opts.report.chainStatus.filter((s) => s.ok);
  if (okChains.length < 1) reasons.push('no_chain_status_ok');
  const chainspecMatches = okChains.some(
    (s) => s.chainspecName === undefined || s.chainspecName === opts.expectedChainspec,
  );
  if (!chainspecMatches) reasons.push('chainspec_mismatch');
  return { canBoot: reasons.length === 0, reasons };
}
