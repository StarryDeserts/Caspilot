'use client';
import { useEffect, useState } from 'react';
import { TraceList, type TraceEntry } from '@/components/TraceList.js';
import { CaspilotApi } from '@/lib/api.js';

const api = new CaspilotApi({
  baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787',
});

export default function IntentDetail({ params }: { params: { id: string } }) {
  const [entries, setEntries] = useState<TraceEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await api.getTrace(params.id).catch(() => ({ entries: [] }));
      if (!cancelled) setEntries(r.entries);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [params.id]);

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Intent {params.id}</h1>
      <TraceList entries={entries} />
    </main>
  );
}
