// Live API health, mapped to the same 3-state vocabulary the HealthDot renders.
// This is the source of truth for the union; HealthDot re-exports it.
export type HealthStatus = 'healthy' | 'degraded' | 'down';

// A tolerant probe result: `reachable` says whether the transport completed at
// all; `httpStatus` is only present when it did. We never throw on a bad status
// — an unhealthy API is a value to render, not an exception to catch.
export interface HealthProbe {
  reachable: boolean;
  httpStatus?: number;
}

export function mapHealth(probe: HealthProbe): { status: HealthStatus; label: string } {
  if (!probe.reachable) return { status: 'down', label: 'unreachable' };
  const code = probe.httpStatus ?? 0;
  if (code >= 200 && code < 300) return { status: 'healthy', label: 'live' };
  return { status: 'degraded', label: `degraded · ${code}` };
}
