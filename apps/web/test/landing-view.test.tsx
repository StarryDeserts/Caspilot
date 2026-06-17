import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingView } from '../src/components/LandingView.js';
import type { HealthProbe } from '../src/lib/health.js';

// A probe that never resolves: keeps HeroTelemetry in its neutral "checking"
// state for the duration of the render so no async state update races the test.
const pending = () => new Promise<HealthProbe>(() => {});

describe('LandingView', () => {
  it('renders the three-step model narrative in order', () => {
    render(<LandingView probe={pending} />);
    expect(screen.getByText('01 · PROPOSE')).toBeDefined();
    expect(screen.getByText('02 · AUTHORIZE')).toBeDefined();
    expect(screen.getByText('03 · EXECUTE')).toBeDefined();
  });

  it('renders the FSM flow row as literal state labels', () => {
    render(<LandingView probe={pending} />);
    expect(screen.getByText('DRAFT')).toBeDefined();
    expect(screen.getByText('POLICY_VALIDATED')).toBeDefined();
    expect(screen.getByText('EXECUTED')).toBeDefined();
  });

  it('renders the security guarantees including the verifiable deploy hash', () => {
    render(<LandingView probe={pending} />);
    expect(screen.getByText('Signer separation')).toBeDefined();
    expect(screen.getByText('Real on-chain proof')).toBeDefined();
    // The real accepted-pay deploy from the Phase 6 casper-test run — a judge can
    // verify it on the explorer, so it must be the genuine hash, not a placeholder.
    expect(
      screen.getByText('a7419aa2fcedff56b76fe509ecc745b9f1da0ecd5b26e0205a0241061242bdf5'),
    ).toBeDefined();
    const proof = screen.getByRole('link', { name: /testnet\.cspr\.live/ });
    expect(proof.getAttribute('href')).toBe(
      'https://testnet.cspr.live/deploy/a7419aa2fcedff56b76fe509ecc745b9f1da0ecd5b26e0205a0241061242bdf5',
    );
  });

  it('renders the proof strip and shows the live network via telemetry', () => {
    render(<LandingView probe={pending} />);
    expect(screen.getByText('FSM states')).toBeDefined();
    expect(screen.getByText('tests')).toBeDefined();
    // HeroTelemetry surfaces the network name immediately, before any probe resolves.
    expect(screen.getAllByText('casper-test').length).toBeGreaterThan(0);
  });
});
