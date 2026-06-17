import { DevelopersView } from '@/components/DevelopersView.js';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Developers · Caspilot x402 API',
  description:
    'A policy-gated intent API for agents on Casper: pay per call with x402 (CEP-18 + EIP-712), move intents through an auditable state machine, and read a redacted trace of every transition.',
};

export default function DevelopersPage() {
  return <DevelopersView />;
}
