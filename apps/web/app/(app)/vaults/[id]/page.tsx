'use client';
import { CaspilotApi } from '@/lib/api.js';
import { VaultDetailView } from '@/components/VaultDetailView.js';

const api = new CaspilotApi({
  baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787',
});

export default function VaultDetail({ params }: { params: { id: string } }) {
  return <VaultDetailView id={params.id} api={api} />;
}
