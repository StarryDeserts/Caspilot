import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIntentTrace, POLLING_STOP_STATES } from '../src/lib/use-intent-trace.js';
import type { TraceEntry } from '../src/lib/api.js';

function row(state: string, kind = 'created'): TraceEntry {
  return { intentId: 'int_x', state, kind, atMs: 0, payload: undefined };
}

// Flush the mount fetch (a non-timer promise) and any chained microtasks.
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
// Advance one poll interval and await the chained async tick.
async function tick(ms = 2000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('POLLING_STOP_STATES', () => {
  it('is the 4 terminal states plus EXECUTED (the demo de-facto stop)', () => {
    expect([...POLLING_STOP_STATES].sort()).toEqual(
      ['EXECUTED', 'EXECUTION_FAILED', 'FINALIZED', 'REJECTED', 'TIMEOUT'].sort(),
    );
  });
});

describe('useIntentTrace', () => {
  it('fetches immediately on mount: loading flips false and entries populate', async () => {
    const getTrace = vi.fn().mockResolvedValue({ entries: [row('DRAFT')] });
    const { result } = renderHook(() => useIntentTrace('int_x', { getTrace }));

    expect(result.current.loading).toBe(true);
    await flush();

    expect(getTrace).toHaveBeenCalledTimes(1);
    expect(getTrace).toHaveBeenCalledWith('int_x');
    expect(result.current.loading).toBe(false);
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.notFound).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('keeps polling every interval while the latest state is non-terminal', async () => {
    const getTrace = vi.fn().mockResolvedValue({ entries: [row('POLICY_VALIDATED')] });
    renderHook(() => useIntentTrace('int_x', { getTrace }));

    await flush();
    expect(getTrace).toHaveBeenCalledTimes(1);
    await tick();
    expect(getTrace).toHaveBeenCalledTimes(2);
    await tick();
    expect(getTrace).toHaveBeenCalledTimes(3);
  });

  it('stops polling once the latest state is EXECUTED (fast-forward stop)', async () => {
    const getTrace = vi
      .fn()
      .mockResolvedValueOnce({ entries: [row('POLICY_VALIDATED')] })
      .mockResolvedValueOnce({ entries: [row('POLICY_VALIDATED'), row('EXECUTED', 'execution')] })
      .mockResolvedValue({ entries: [row('POLICY_VALIDATED'), row('EXECUTED', 'execution')] });
    const { result } = renderHook(() => useIntentTrace('int_x', { getTrace }));

    await flush(); // call 1 → POLICY_VALIDATED (continue)
    await tick(); // call 2 → EXECUTED (stop)
    expect(getTrace).toHaveBeenCalledTimes(2);
    expect(result.current.entries.at(-1)?.state).toBe('EXECUTED');

    await tick(); // no further polling
    await tick();
    expect(getTrace).toHaveBeenCalledTimes(2);
  });

  it('stops polling on a terminal off-ramp (REJECTED)', async () => {
    const getTrace = vi
      .fn()
      .mockResolvedValueOnce({ entries: [row('DRAFT')] })
      .mockResolvedValue({ entries: [row('DRAFT'), row('REJECTED', 'rejected')] });
    renderHook(() => useIntentTrace('int_x', { getTrace }));

    await flush(); // DRAFT (continue)
    await tick(); // REJECTED (stop)
    expect(getTrace).toHaveBeenCalledTimes(2);
    await tick();
    expect(getTrace).toHaveBeenCalledTimes(2);
  });

  it('treats a 404 as notFound and stops polling', async () => {
    const getTrace = vi.fn().mockRejectedValue(new Error('getTrace 404: not found'));
    const { result } = renderHook(() => useIntentTrace('int_x', { getTrace }));

    await flush();
    expect(result.current.notFound).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(getTrace).toHaveBeenCalledTimes(1);

    await tick();
    expect(getTrace).toHaveBeenCalledTimes(1);
  });

  it('surfaces a transient (non-404) error but keeps polling, then recovers', async () => {
    const getTrace = vi
      .fn()
      .mockRejectedValueOnce(new Error('getTrace 500: boom'))
      .mockResolvedValue({ entries: [row('DRAFT')] });
    const { result } = renderHook(() => useIntentTrace('int_x', { getTrace }));

    await flush(); // 500 → error surfaced, still polling
    expect(result.current.error).toMatch(/500/);
    expect(result.current.notFound).toBe(false);

    await tick(); // recovers
    expect(result.current.error).toBeNull();
    expect(result.current.entries).toHaveLength(1);
    expect(getTrace).toHaveBeenCalledTimes(2);
  });

  it('stops polling after unmount', async () => {
    const getTrace = vi.fn().mockResolvedValue({ entries: [row('POLICY_VALIDATED')] });
    const { unmount } = renderHook(() => useIntentTrace('int_x', { getTrace }));

    await flush();
    expect(getTrace).toHaveBeenCalledTimes(1);
    unmount();
    await tick();
    await tick();
    expect(getTrace).toHaveBeenCalledTimes(1);
  });

  it('respects a custom interval', async () => {
    const getTrace = vi.fn().mockResolvedValue({ entries: [row('DRAFT')] });
    renderHook(() => useIntentTrace('int_x', { getTrace }, { intervalMs: 500 }));

    await flush();
    expect(getTrace).toHaveBeenCalledTimes(1);
    await tick(500);
    expect(getTrace).toHaveBeenCalledTimes(2);
  });
});
