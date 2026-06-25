import type { IntentSummary } from './api.js';

// Honest console counters derived purely from listIntents() — no fabricated
// cap/value numbers (the spend-ledger isn't exposed over HTTP until M4).
const EXECUTED_STATES = ['EXECUTED', 'FINALIZED'];
const REJECTED_STATES = ['REJECTED', 'EXECUTION_FAILED', 'TIMEOUT'];
const TERMINAL_STATES = [...EXECUTED_STATES, ...REJECTED_STATES];

const DAY_MS = 86_400_000;

export interface ConsoleSummary {
  active: number;
  awaitingPolicy: number;
  executedToday: number;
  rejectedToday: number;
}

// Epoch 0 is UTC midnight and JS time has no leap seconds, so flooring to the
// day boundary yields the start of the current UTC day without a Date object.
function startOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

export function summarizeConsole(intents: readonly IntentSummary[], nowMs: number): ConsoleSummary {
  const dayStart = startOfUtcDay(nowMs);
  const isToday = (ms: number) => ms >= dayStart && ms < dayStart + DAY_MS;

  let active = 0;
  let awaitingPolicy = 0;
  let executedToday = 0;
  let rejectedToday = 0;

  for (const i of intents) {
    if (!TERMINAL_STATES.includes(i.state)) active += 1;
    if (i.state === 'DRAFT') awaitingPolicy += 1;
    if (EXECUTED_STATES.includes(i.state) && isToday(i.updatedAtMs)) executedToday += 1;
    if (REJECTED_STATES.includes(i.state) && isToday(i.updatedAtMs)) rejectedToday += 1;
  }

  return { active, awaitingPolicy, executedToday, rejectedToday };
}
