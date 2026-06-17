import type { TraceEntry } from './api.js';

// The frontend stays decoupled from @caspilot/intent-fsm (no workspace import):
// states are plain strings over the wire, mirroring StateBadge. These two arrays
// are the happy-path rail and the terminal-bad off-ramp from the artifact.
export const HAPPY_PATH = [
  'DRAFT',
  'POLICY_VALIDATED',
  'PAYMENT_REQUIRED',
  'PAYMENT_VERIFIED',
  'READY_TO_SUBMIT',
  'SIGNED_RECEIVED',
  'ACCEPTED_BY_NODE',
  'EXECUTED',
  'FINALIZED',
] as const;

export const OFF_RAMP = ['REJECTED', 'EXECUTION_FAILED', 'TIMEOUT'] as const;

export type HappyState = (typeof HAPPY_PATH)[number];
export type OffRampState = (typeof OFF_RAMP)[number];
export type IntentState = HappyState | OffRampState;

export interface IntentBody {
  agent: string;
  receiver: string;
  token: string;
  contract: string;
  network: string;
  amount: string;
}

// Fields are `T | undefined` (not just optional) because deriveIntent assigns
// values that may be undefined under exactOptionalPropertyTypes, and consumers
// read them as "known or not yet on the trace".
export interface IntentView {
  state?: string | undefined;
  body?: IntentBody | undefined;
  policyDigest?: string | undefined;
  deployHash?: string | undefined;
  rejectionCode?: string | undefined;
  rejectionReason?: string | undefined;
}

function asRecord(x: unknown): Record<string, unknown> | undefined {
  return typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : undefined;
}

function str(x: unknown): string | undefined {
  return typeof x === 'string' ? x : undefined;
}

// Derive current field values from the trace. Entries are oldest-first, so the
// latest state is the last entry; later rows overwrite earlier captures.
export function deriveIntent(entries: TraceEntry[]): IntentView {
  const view: IntentView = {};
  if (entries.length === 0) return view;
  view.state = entries[entries.length - 1]?.state;

  for (const e of entries) {
    const p = asRecord(e.payload) ?? {};
    if (e.kind === 'created') {
      const body = asRecord(p.body);
      if (body) view.body = body as unknown as IntentBody;
    } else if (e.kind === 'policy_check') {
      if (p.allowed === true) view.policyDigest = str(p.policyDigest);
      else if (p.allowed === false) view.rejectionCode = str(p.code);
    } else if (e.kind === 'execution') {
      view.deployHash = str(p.deployHash);
    } else if (e.kind === 'rejected') {
      view.rejectionReason = str(p.reason);
    }
  }
  return view;
}

export type StepStatus = 'done' | 'current' | 'future';

export interface StepNode {
  state: HappyState;
  status: StepStatus;
}

export interface StepperModel {
  steps: StepNode[];
  activeOffRamp?: OffRampState;
}

// Build the rail model honestly: `done` means the state ACTUALLY appears in the
// trace (never inferred from position), so the mark-executed fast-forward that
// skips PAYMENT_REQUIRED..ACCEPTED_BY_NODE leaves those nodes `future`, not a
// fabricated `done`. `current` is the latest happy state; an off-ramp leaves no
// node current and is surfaced via activeOffRamp.
export function buildStepper(entries: TraceEntry[]): StepperModel {
  const reached = new Set(entries.map((e) => e.state));
  const final = entries[entries.length - 1]?.state;
  const activeOffRamp = (OFF_RAMP as readonly string[]).includes(final ?? '')
    ? (final as OffRampState)
    : undefined;

  const steps: StepNode[] = HAPPY_PATH.map((state) => {
    let status: StepStatus;
    if (!activeOffRamp && state === final) status = 'current';
    else if (reached.has(state)) status = 'done';
    else status = 'future';
    return { state, status };
  });

  return activeOffRamp ? { steps, activeOffRamp } : { steps };
}
