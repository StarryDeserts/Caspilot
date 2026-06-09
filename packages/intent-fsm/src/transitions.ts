import type { IntentState } from './states.js';

export const TERMINAL_STATES = ['FINALIZED', 'EXECUTION_FAILED', 'REJECTED', 'TIMEOUT'] as const;
type Terminal = (typeof TERMINAL_STATES)[number];

const transitions: Array<[IntentState, IntentState[]]> = [
  ['DRAFT', ['POLICY_VALIDATED', 'REJECTED', 'TIMEOUT']],
  ['POLICY_VALIDATED', ['PAYMENT_REQUIRED', 'REJECTED', 'TIMEOUT']],
  ['PAYMENT_REQUIRED', ['PAYMENT_VERIFIED', 'TIMEOUT']],
  ['PAYMENT_VERIFIED', ['READY_TO_SUBMIT', 'TIMEOUT']],
  ['READY_TO_SUBMIT', ['SIGNED_RECEIVED', 'TIMEOUT']],
  ['SIGNED_RECEIVED', ['ACCEPTED_BY_NODE', 'TIMEOUT']],
  ['ACCEPTED_BY_NODE', ['EXECUTED', 'EXECUTION_FAILED', 'TIMEOUT']],
  ['EXECUTED', ['FINALIZED']],
];

export const ALLOWED_TRANSITIONS: ReadonlyMap<IntentState, ReadonlySet<IntentState>> = new Map(
  transitions.map(([from, to]) => [from, new Set(to)]),
);

export function isTerminal(state: IntentState): state is Terminal {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

export function canTransition(from: IntentState, to: IntentState): boolean {
  if (isTerminal(from)) return false;
  const set = ALLOWED_TRANSITIONS.get(from);
  return set?.has(to) ?? false;
}
