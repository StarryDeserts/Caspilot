import type { HealthStatus } from '../lib/health.js';

export type { HealthStatus };

export function HealthDot({ status, label }: { status: HealthStatus; label?: string }) {
  return (
    <div className={`health-dot ${status}`} role="status" aria-label={label ?? `API ${status}`}>
      <span className="dot" />
    </div>
  );
}
