'use client';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { CaspilotApi } from '@/lib/api.js';
import { ConsoleView } from '@/components/ConsoleView.js';

const api = new CaspilotApi({
  baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787',
});

export default function ConsolePage() {
  const router = useRouter();
  return (
    <ConsoleView
      api={api}
      onOpen={(id) => router.push(`/intents/${id}` as Route)}
      onViewAll={() => router.push('/intents' as Route)}
    />
  );
}
