'use client';
import { useEffect, useState } from 'react';
import { CaspilotApi } from '../lib/api.js';
import { mapHealth, type HealthProbe, type HealthStatus } from '../lib/health.js';
import { HealthDot } from './HealthDot.js';

// The hero chip reads as live telemetry, so it must tell the truth: instead of
// a hardcoded block height / deploy hash, it probes the real API and renders the
// mapped health. Until the probe resolves it shows a neutral "checking" — never
// a fabricated "verified".
export interface HeroTelemetryProps {
  network?: string;
  probe?: () => Promise<HealthProbe>;
}

function defaultProbe(): Promise<HealthProbe> {
  const api = new CaspilotApi({
    baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787',
  });
  return api.health();
}

export function HeroTelemetry({ network = 'casper-test', probe }: HeroTelemetryProps) {
  const [view, setView] = useState<{ status: HealthStatus; label: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const run = probe ?? defaultProbe;
    run()
      .then((p) => alive && setView(mapHealth(p)))
      .catch(() => alive && setView({ status: 'down', label: 'unreachable' }));
    return () => {
      alive = false;
    };
  }, [probe]);

  return (
    <div className="telemetry mono">
      {view ? (
        <HealthDot status={view.status} label={`API ${view.status}`} />
      ) : (
        <span className="tdot checking" aria-hidden="true" />
      )}
      <span className="tnet">{network}</span>
      <span className="tsep">·</span>
      <span className="tstatus">{view ? view.label : 'checking…'}</span>
    </div>
  );
}
