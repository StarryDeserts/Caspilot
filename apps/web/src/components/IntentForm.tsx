'use client';
import { useState } from 'react';

const ACCOUNT_HASH = /^00[0-9a-f]{64}$/;

export interface IntentFormValue {
  agent: string;
  receiver: string;
  token: string;
  contract: string;
  network: string;
  amount: string;
}

export function IntentForm({ defaults, onSubmit }: { defaults: { network: string }; onSubmit: (v: IntentFormValue) => void }) {
  const [v, setV] = useState<IntentFormValue>({ agent: '', receiver: '', token: '', contract: '', network: defaults.network, amount: '' });
  const [err, setErr] = useState<string | null>(null);

  function setField<K extends keyof IntentFormValue>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setV((prev) => ({ ...prev, [k]: e.target.value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ACCOUNT_HASH.test(v.agent)) return setErr('agent must be an account-hash hex (00<64 hex>)');
    if (!ACCOUNT_HASH.test(v.receiver)) return setErr('receiver must be an account-hash hex');
    if (!ACCOUNT_HASH.test(v.contract)) return setErr('contract must be an account-hash hex');
    if (!v.amount || !/^\d+$/.test(v.amount)) return setErr('amount must be a decimal string');
    setErr(null);
    onSubmit(v);
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <Input id="agent" label="Agent" value={v.agent} onChange={setField('agent')} />
      <Input id="receiver" label="Receiver" value={v.receiver} onChange={setField('receiver')} />
      <Input id="token" label="Token" value={v.token} onChange={setField('token')} />
      <Input id="contract" label="Contract" value={v.contract} onChange={setField('contract')} />
      <Input id="amount" label="Amount" value={v.amount} onChange={setField('amount')} />
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <button type="submit" className="bg-zinc-100 text-zinc-900 px-3 py-1 rounded">Create intent</button>
    </form>
  );
}

function Input({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm text-zinc-400">{label}</span>
      <input id={id} value={value} onChange={onChange} className="block w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1" />
    </label>
  );
}
