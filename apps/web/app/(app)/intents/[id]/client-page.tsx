'use client';
import { IntentDetailView } from '@/components/IntentDetailView.js';
import { CaspilotApi } from '@/lib/api.js';
import { useWallet } from '@/lib/wallet-context.js';

const api = new CaspilotApi({
  baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787',
});

export function IntentDetailClientPage({ id }: { id: string }) {
  const wallet = useWallet();
  return <IntentDetailView id={id} api={api} wallet={wallet} />;
}
