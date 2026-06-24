'use client';
import { CaspilotApi } from '@/lib/api.js';
import { IntentDetailView } from '@/components/IntentDetailView.js';
import { useWallet } from '@/lib/wallet-context.js';

const api = new CaspilotApi({
  baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787',
});

export default function IntentDetail({ params }: { params: { id: string } }) {
  const wallet = useWallet();
  return <IntentDetailView id={params.id} api={api} wallet={wallet} />;
}
