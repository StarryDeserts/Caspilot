'use client';
import { CaspilotApi } from '@/lib/api.js';
import { IntentDetailView } from '@/components/IntentDetailView.js';

const api = new CaspilotApi({
  baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787',
});

export default function IntentDetail({ params }: { params: { id: string } }) {
  return <IntentDetailView id={params.id} api={api} />;
}
