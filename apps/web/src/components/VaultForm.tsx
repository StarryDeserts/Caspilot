'use client';
import { useState } from 'react';

const ACCOUNT_HASH = /^00[0-9a-f]{64}$/;

export interface VaultFormValue {
  admin: string;
  cep18Contract: string;
  maxSinglePayment: string;
  dailyLimit: string;
  validUntilMs: number;
}

export function VaultForm({ onSubmit }: { onSubmit: (v: VaultFormValue) => void }) {
  const [admin, setAdmin] = useState('');
  const [cep18, setCep18] = useState('');
  const [maxSingle, setMaxSingle] = useState('');
  const [daily, setDaily] = useState('');
  const [until, setUntil] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ACCOUNT_HASH.test(admin)) return setErr('admin must be an account-hash hex (00<64 hex>)');
    if (!ACCOUNT_HASH.test(cep18)) return setErr('CEP-18 contract must be an account-hash hex');
    if (!/^\d+$/.test(maxSingle)) return setErr('max single payment must be a decimal string');
    if (!/^\d+$/.test(daily)) return setErr('daily limit must be a decimal string');
    if (!until) return setErr('valid until is required');
    setErr(null);
    const validUntilMs = new Date(until + 'T00:00:00Z').getTime();
    onSubmit({
      admin,
      cep18Contract: cep18,
      maxSinglePayment: maxSingle,
      dailyLimit: daily,
      validUntilMs,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <Field id="admin" label="Admin (account hash)" value={admin} onChange={setAdmin} />
      <Field id="cep18" label="CEP-18 contract" value={cep18} onChange={setCep18} />
      <Field id="max" label="Max single payment" value={maxSingle} onChange={setMaxSingle} />
      <Field id="daily" label="Daily limit" value={daily} onChange={setDaily} />
      <Field id="until" label="Valid until" value={until} onChange={setUntil} type="date" />
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <button type="submit" className="bg-zinc-100 text-zinc-900 px-3 py-1 rounded">
        Create
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
}: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm text-zinc-400">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
      />
    </label>
  );
}
