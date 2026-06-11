import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type TierOneArtifacts, TierOneArtifactsSchema } from '../src/schema.js';

export function assembleTier1Artifacts(input: {
  now: number;
  network: string;
  chainspec: string;
  vault: TierOneArtifacts['vault'];
  paySuccess: TierOneArtifacts['paySuccess'];
  rejections: TierOneArtifacts['rejections'];
  notes?: string;
}): TierOneArtifacts {
  // Defended here as well as in the schema so a programmatic caller gets a clear
  // message before zod's generic array error — tier 1 is meaningless without a
  // real rejection on record.
  if (input.rejections.length < 1) {
    throw new Error('tier 1 requires at least one real rejection');
  }
  // A tier-1 artifact describes one chain. If the operator widens `network`
  // away from the chainspec we fail loudly rather than emit a cross-chain claim.
  if (input.network !== input.chainspec) {
    throw new Error(
      `chainspec ${input.chainspec} does not match network ${input.network} — a tier 1 demo must be a single chain`,
    );
  }
  const draft: TierOneArtifacts = {
    generatedAtMs: input.now,
    network: input.network,
    chainspec: input.chainspec,
    vault: input.vault,
    paySuccess: input.paySuccess,
    rejections: input.rejections,
  };
  if (input.notes !== undefined) draft.notes = input.notes;
  return TierOneArtifactsSchema.parse(draft);
}

async function main(): Promise<void> {
  const env = process.env;
  // run-tier1.ts (Task 6.8) produces tier1-events.json in real mode; this is the
  // standalone dumper that seals it into a schema-valid tier1-artifacts.json.
  const demoDir = resolve(process.cwd(), '.demo');
  const events = JSON.parse(readFileSync(`${demoDir}/tier1-events.json`, 'utf8'));
  const chainspec = env.CASPER_CHAINSPEC ?? 'casper-test';
  const artifacts = assembleTier1Artifacts({
    now: Date.now(),
    network: chainspec,
    chainspec,
    vault: events.vault,
    paySuccess: events.paySuccess,
    rejections: events.rejections,
    ...(env.DEMO_NOTES ? { notes: env.DEMO_NOTES } : {}),
  });
  mkdirSync(demoDir, { recursive: true });
  writeFileSync(`${demoDir}/tier1-artifacts.json`, JSON.stringify(artifacts, null, 2));
  console.log(`[dump-tier1] wrote ${demoDir}/tier1-artifacts.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
