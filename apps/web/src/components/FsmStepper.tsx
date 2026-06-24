import { buildStepper, OFF_RAMP } from '../lib/intent-view.js';
import type { TraceEntry } from '../lib/api.js';

// Renders the happy-path rail from a trace. All status is derived by
// buildStepper (done === the state actually appears in the trace), so the
// mark-executed fast-forward never paints skipped nodes as done. The active
// off-ramp, when reached, is highlighted among the three terminal-bad badges.
export function FsmStepper({ entries, corner }: { entries: TraceEntry[]; corner?: string }) {
  const { steps, activeOffRamp } = buildStepper(entries);
  return (
    <div className="stepper-panel">
      {corner ? <span className="panel-corner">{corner}</span> : null}
      <div className="stepper">
        {steps.map((s) => (
          <div key={s.state} className={`step${s.status === 'future' ? '' : ` ${s.status}`}`}>
            <div className={`connector${s.linkDone ? ' done' : ''}`} />
            <div className="node">
              {s.status === 'done' ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12l5 5 9-11" />
                </svg>
              ) : null}
            </div>
            <div className="step-label">{s.state}</div>
          </div>
        ))}
      </div>
      <div className="offramp">
        <span className="lbl">terminal-bad off-ramp:</span>
        {OFF_RAMP.map((s) => (
          <span key={s} className={`badge failed${activeOffRamp === s ? ' is-active' : ''}`}>
            <span className="bdot" />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
