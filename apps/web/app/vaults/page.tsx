'use client';
import { useState } from 'react';
import { VaultForm, type VaultFormValue } from '@/components/VaultForm.js';

export default function VaultsPage() {
  const [submitted, setSubmitted] = useState<VaultFormValue | null>(null);
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">PolicyVaults</h1>
      <p className="text-zinc-400 text-sm">Drafts a deploy payload — the user signs with CSPR.click; the backend never sees the private key.</p>
      <VaultForm onSubmit={setSubmitted} />
      {submitted && (
        <pre className="bg-zinc-900 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(submitted, null, 2)}</pre>
      )}
    </main>
  );
}
