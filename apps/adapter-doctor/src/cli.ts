import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BootGate, CapabilityReport } from '@caspilot/adapters';

export interface DoctorProbes {
  db: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  chainStatus: () => Promise<
    Array<{ name: string; ok: boolean; chainspecName?: string; reason?: string }>
  >;
  observation: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  strategy: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  dex: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  submission: () => Promise<{ ok: true } | { ok: false; reason: string }>;
}

export async function runDoctor(opts: { expectedChainspec: string; probes: DoctorProbes }) {
  const report = CapabilityReport.parse({
    db: await opts.probes.db(),
    chainStatus: await opts.probes.chainStatus(),
    observation: await opts.probes.observation(),
    strategy: await opts.probes.strategy(),
    dex: await opts.probes.dex(),
    submission: await opts.probes.submission(),
  });
  const decision = BootGate({ report, expectedChainspec: opts.expectedChainspec });
  return { ...decision, report };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  console.error(
    'adapter-doctor CLI: configure probes in a runner script; library mode used by tests.',
  );
  process.exit(1);
}
