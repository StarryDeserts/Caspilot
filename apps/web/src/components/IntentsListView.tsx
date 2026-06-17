'use client';
import { useEffect, useMemo, useState } from 'react';
import type { CreateIntentBody, IntentSummary } from '../lib/api.js';
import {
  FILTERS,
  type FilterKey,
  filterCounts,
  matchesFilter,
  matchesSearch,
  sortByUpdatedDesc,
} from '../lib/intent-list.js';
import { IntentsTable } from './IntentsTable.js';
import { NewIntentDrawer } from './NewIntentDrawer.js';

// The detail view's seam, mirrored for the list: a presentational component
// over an injected api slice, imported relatively so jsdom tests exercise the
// whole path (load → filter/search → create → optimistic prepend → navigate)
// with no transport. The page wrapper constructs the real client + router.
export interface IntentsListApi {
  listIntents(): Promise<IntentSummary[]>;
  createIntent(body: CreateIntentBody): Promise<{ id: string; state: string }>;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function IntentsListView({
  api,
  onOpen,
  now = Date.now(),
}: {
  api: IntentsListApi;
  onOpen: (id: string) => void;
  now?: number;
}) {
  const [intents, setIntents] = useState<IntentSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; state: string } | null>(null);

  useEffect(() => {
    let live = true;
    api
      .listIntents()
      .then((list) => {
        if (live) setIntents(sortByUpdatedDesc(list));
      })
      .catch((e) => {
        if (live) {
          setLoadError(message(e));
          setIntents([]);
        }
      });
    return () => {
      live = false;
    };
  }, [api]);

  const counts = useMemo(() => filterCounts(intents ?? []), [intents]);
  const visible = useMemo(
    () => (intents ?? []).filter((i) => matchesFilter(i.state, filter) && matchesSearch(i, query)),
    [intents, filter, query],
  );

  async function create(body: CreateIntentBody) {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.createIntent(body);
      const summary: IntentSummary = { ...body, id: res.id, state: res.state, updatedAtMs: now };
      setIntents((prev) => [summary, ...(prev ?? [])]);
      setDrawerOpen(false);
      setToast({ id: res.id, state: res.state });
      onOpen(res.id);
    } catch (e) {
      setCreateError(message(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rail">
      <div className="page-head">
        <div>
          <h1 className="page-title">Intents</h1>
          <p className="page-purpose">
            Every payment intent your agent proposed, and where the policy took it.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setDrawerOpen(true)}>
          <PlusIcon />
          New intent
        </button>
      </div>

      <div className="toolbar">
        <SegmentedFilter value={filter} counts={counts} onChange={setFilter} />
        <SearchBox value={query} onChange={setQuery} />
      </div>

      {loadError ? (
        <div className="inline-alert show" role="alert" style={{ marginBottom: 16 }}>
          <AlertIcon />
          <div className="ia-body">
            Couldn't load intents
            <div className="ia-code">{loadError}</div>
          </div>
        </div>
      ) : null}

      {intents === null ? (
        <SkeletonTable />
      ) : intents.length === 0 ? (
        <div className="table-wrap">
          <EmptyState onNew={() => setDrawerOpen(true)} />
        </div>
      ) : visible.length === 0 ? (
        <div className="table-wrap">
          <div className="empty">
            <div className="etitle">No matching intents</div>
            <div className="emsg">No intent matches this filter or search.</div>
          </div>
        </div>
      ) : (
        <IntentsTable
          intents={visible}
          nowMs={now}
          onOpen={onOpen}
          corner="casper:casper-test · synced"
        />
      )}

      <NewIntentDrawer
        open={drawerOpen}
        busy={creating}
        serverError={createError}
        onClose={() => setDrawerOpen(false)}
        onCreate={create}
      />

      <Toast toast={toast} />
    </div>
  );
}

function SegmentedFilter({
  value,
  counts,
  onChange,
}: {
  value: FilterKey;
  counts: Record<FilterKey, number>;
  onChange: (key: FilterKey) => void;
}) {
  return (
    <div className="segmented" role="tablist" aria-label="Filter intents by state">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          role="tab"
          aria-selected={value === f.key}
          className={`seg${value === f.key ? ' active' : ''}`}
          onClick={() => onChange(f.key)}
        >
          {f.label} <span className="cnt">{counts[f.key]}</span>
        </button>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="search">
      <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </svg>
      <input
        type="text"
        placeholder="search id or agent…"
        aria-label="Search intents by id or agent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Toast({ toast }: { toast: { id: string; state: string } | null }) {
  return (
    <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true">
        <path d="M5 12l5 5 9-11" />
      </svg>
      <div className="t-body">
        Intent created
        {toast ? (
          <div className="t-id">
            {toast.id.slice(0, 8)}… · {toast.state}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="empty">
      <div className="eicon">
        <svg viewBox="0 0 24 24" strokeWidth="1.6" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      </div>
      <div className="etitle">No intents yet</div>
      <div className="emsg">Propose your first — the agent drafts it, the policy decides.</div>
      <button className="btn btn-primary" onClick={onNew}>
        <PlusIcon />
        New intent
      </button>
    </div>
  );
}

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
              {[90, 42, 42, 100, 40, 96, 54].map((w, c) => (
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

function PlusIcon() {
  return (
    <svg className="plus" viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}
