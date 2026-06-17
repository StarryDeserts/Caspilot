'use client';
import { useEffect, useRef, useState } from 'react';
import type { TraceEntry } from './api.js';

// Polling stops once the intent reaches a state with no live successor. That is
// the FSM's terminal set (FINALIZED + the three off-ramps) PLUS EXECUTED: the
// demo's mark-executed has no wired successor, so EXECUTED is the de-facto stop.
export const POLLING_STOP_STATES: readonly string[] = [
  'FINALIZED',
  'EXECUTION_FAILED',
  'REJECTED',
  'TIMEOUT',
  'EXECUTED',
];
const STOP = new Set(POLLING_STOP_STATES);

// The hook depends only on a getTrace(id) call, so any object of this shape works
// (the real CaspilotApi, or a vi.fn() mock in tests). Injecting it keeps the hook
// pure of transport concerns and trivially testable under fake timers.
export interface TraceClient {
  getTrace(id: string): Promise<{ entries: TraceEntry[] }>;
}

export interface UseIntentTraceResult {
  entries: TraceEntry[];
  loading: boolean;
  notFound: boolean;
  error: string | null;
}

// A 404 is a definitive "this intent does not exist" — stop polling. Every other
// failure is treated as transient (a network blip) and polling continues. The
// CaspilotApi error formatter produces "getTrace 404[: detail]", so match the
// status as a standalone token.
function isNotFound(e: unknown): boolean {
  return e instanceof Error && / 404\b/.test(e.message);
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useIntentTrace(
  intentId: string,
  client: TraceClient,
  opts?: { intervalMs?: number },
): UseIntentTraceResult {
  const intervalMs = opts?.intervalMs ?? 2000;
  const [entries, setEntries] = useState<TraceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hold the client in a ref so a new client identity per render does not restart
  // the polling loop; only intentId/intervalMs changes should.
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Recursive setTimeout (not setInterval): the next poll is scheduled only
    // after the current async tick resolves, so a stop decision simply skips
    // re-scheduling — no overlapping in-flight requests, deterministic teardown.
    const schedule = () => {
      timer = setTimeout(run, intervalMs);
    };

    const run = async () => {
      try {
        const res = await clientRef.current.getTrace(intentId);
        if (cancelled) return;
        setEntries(res.entries);
        setError(null);
        setLoading(false);
        const latest = res.entries[res.entries.length - 1]?.state;
        if (latest && STOP.has(latest)) return; // terminal: stop polling
        schedule();
      } catch (e) {
        if (cancelled) return;
        setLoading(false);
        if (isNotFound(e)) {
          setNotFound(true);
          return; // definitive: stop polling
        }
        setError(messageOf(e));
        schedule(); // transient: keep polling
      }
    };

    // Reset on (re)subscribe so a changed intentId never shows stale rows.
    setEntries([]);
    setLoading(true);
    setNotFound(false);
    setError(null);
    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [intentId, intervalMs]);

  return { entries, loading, notFound, error };
}
