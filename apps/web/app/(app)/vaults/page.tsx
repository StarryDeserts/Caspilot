'use client';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { CaspilotApi } from '@/lib/api.js';
import { VaultsListView } from '@/components/VaultsListView.js';

const api = new CaspilotApi({
  baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787',
});

export default function VaultsPage() {
  const router = useRouter();
  return <VaultsListView api={api} onOpen={(id) => router.push(`/vaults/${id}` as Route)} />;
}
