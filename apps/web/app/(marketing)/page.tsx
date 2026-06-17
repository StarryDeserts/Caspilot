import type { Metadata } from 'next';
import { LandingView } from '@/components/LandingView.js';

export const metadata: Metadata = {
  title: 'Caspilot · Autonomy you can audit',
  description:
    'An autonomous DeFi-yield agent on Casper: the AI proposes, a policy and signer authorize, the chain executes — every step on the record.',
};

export default function Home() {
  return <LandingView />;
}
