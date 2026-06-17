'use client';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { CaspilotApi } from '@/lib/api.js';
import { IntentsListView } from '@/components/IntentsListView.js';

const api = new CaspilotApi({
  baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787',
});

export default function IntentsPage() {
  const router = useRouter();
  return <IntentsListView api={api} onOpen={(id) => router.push(`/intents/${id}` as Route)} />;
}
