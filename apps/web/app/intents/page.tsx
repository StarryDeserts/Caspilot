'use client';
import { useState } from 'react';
import { IntentForm, type IntentFormValue } from '@/components/IntentForm.js';
import { StateBadge } from '@/components/StateBadge.js';
import { CaspilotApi } from '@/lib/api.js';

const api = new CaspilotApi({
  baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787',
});

export default function IntentsPage() {
  const [latest, setLatest] = useState<{ id: string; state: string } | null>(null);
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Intents</h1>
      <IntentForm
        defaults={{ network: process.env.NEXT_PUBLIC_CASPER_NETWORK ?? 'casper:casper-test' }}
        onSubmit={async (v: IntentFormValue) => setLatest(await api.createIntent(v))}
      />
      {latest && (
        <div className="flex items-center gap-2">
          <StateBadge state={latest.state} />
          <span className="text-xs text-zinc-400">{latest.id}</span>
        </div>
      )}
    </main>
  );
}
