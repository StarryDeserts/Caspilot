'use client';
import { VaultDetailView } from '@/components/VaultDetailView.js';
import { CaspilotApi } from '@/lib/api.js';

const api = new CaspilotApi({
  baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787',
});

export function VaultDetailClientPage({ id }: { id: string }) {
  return <VaultDetailView id={id} api={api} />;
}
