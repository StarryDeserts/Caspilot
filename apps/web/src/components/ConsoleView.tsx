'use client';
import { useEffect, useState } from 'react';
import type { IntentSummary } from '../lib/api.js';
import { sortByUpdatedDesc } from '../lib/intent-list.js';
import { summarizeConsole } from '../lib/console-summary.js';
import { IntentsTable } from './IntentsTable.js';
import { RollingNumber } from './RollingNumber.js';

export interface ConsoleApi {
  listIntents: () => Promise<IntentSummary[]>;
}

const RECENT_LIMIT = 5;

function PlusIcon() {
  return (
    <svg className="plus" viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

// The three guarantees are literal architectural invariants of Caspilot, not
// decorative copy: the signer is a separate process, the API never returns raw
// secrets, and no private key ever reaches the browser bundle.
const GUARANTEES: Array<{ label: string; icon: JSX.Element }> = [
  {
    label: 'signer separation',
    icon: (
      <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
      </svg>
    ),
  },
  {
    label: 'redacted trace',
    icon: (
      <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7z" />
        <path d="M4 4l16 16" />
      </svg>
    ),
  },
  {
    label: 'no keys in browser',
    icon: (
      <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    ),
  },
];

function SkeletonTable() {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Intent</th>
            <th>Agent</th>
            <th>Receiver</th>
            <th>Token</th>
            <th className="num">Amount</th>
            <th>State</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((r) => (
            <tr key={r}>
              {[80, 42, 42, 100, 40, 96, 50].map((w, c) => (
                <td key={c} className={c === 4 ? 'num' : undefined}>
                  <span className="sk" style={{ width: w }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyRecent({ onNew }: { onNew: () => void }) {
  return (
    <div className="empty">
      <div className="eicon">
        <svg viewBox="0 0 24 24" strokeWidth="1.6" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      </div>
      <div className="etitle">No intents yet</div>
      <div className="emsg">Propose your first — the agent drafts it, the policy decides.</div>
      <button className="btn btn-primary" type="button" onClick={onNew}>
        <PlusIcon />
        New intent
      </button>
    </div>
  );
}

export function ConsoleView({
  api,
  onOpen,
  onViewAll,
  now = Date.now(),
}: {
  api: ConsoleApi;
  onOpen: (id: string) => void;
  onViewAll: () => void;
  now?: number;
}) {
  const [intents, setIntents] = useState<IntentSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .listIntents()
      .then((rows) => {
        if (live) {
          setIntents(rows);
          setLoadError(null);
        }
      })
      .catch((e: unknown) => {
        if (live) {
          setLoadError(e instanceof Error ? e.message : String(e));
          setIntents([]);
        }
      });
    return () => {
      live = false;
    };
  }, [api]);

  const loading = intents === null;
  const all = intents ?? [];
  const summary = summarizeConsole(all, now);
  const recent = sortByUpdatedDesc(all).slice(0, RECENT_LIMIT);

  const stats: Array<{ label: string; value: number }> = [
    { label: 'Active intents', value: summary.active },
    { label: 'Awaiting policy', value: summary.awaitingPolicy },
    { label: 'Executed today', value: summary.executedToday },
    { label: 'Rejected today', value: summary.rejectedToday },
  ];

  return (
    <div className="rail">
      <div className="page-head">
        <div>
          <h1 className="page-title">Console</h1>
          <p className="page-purpose">
            Propose, authorize, and execute agent intents on casper-test.
          </p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" type="button" onClick={onViewAll}>
            <PlusIcon />
            New intent
          </button>
        </div>
      </div>

      <div className={`inline-alert${loadError ? ' show' : ''}`} role="alert">
        <AlertIcon />
        <div className="ia-body">
          Couldn't load intents
          {loadError ? <div className="ia-code">{loadError}</div> : null}
        </div>
      </div>

      <div className="strip">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="slabel">{s.label}</div>
            <div className="snum">
              <RollingNumber value={s.value} />
            </div>
          </div>
        ))}
      </div>

      <div className="panel panel-flush">
        <div className="panel-head">
          <h3>Recent intents</h3>
          <button className="view-all" type="button" onClick={onViewAll}>
            View all
            <ArrowIcon />
          </button>
        </div>
        {loading ? (
          <SkeletonTable />
        ) : loadError ? null : recent.length === 0 ? (
          <EmptyRecent onNew={onViewAll} />
        ) : (
          <IntentsTable intents={recent} nowMs={now} onOpen={onOpen} />
        )}
      </div>

      <div className="foot-strip">
        <span className="gtitle">guarantees</span>
        {GUARANTEES.map((g) => (
          <span className="guarantee" key={g.label}>
            {g.icon}
            {g.label}
          </span>
        ))}
      </div>
    </div>
  );
}
