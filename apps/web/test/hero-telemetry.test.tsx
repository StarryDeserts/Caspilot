import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroTelemetry } from '../src/components/HeroTelemetry.js';

describe('HeroTelemetry', () => {
  it('shows the network name immediately, before any probe resolves', () => {
    render(<HeroTelemetry network="casper-test" probe={() => new Promise(() => {})} />);
    expect(screen.getByText('casper-test')).toBeDefined();
  });

  it('reflects a live API as a healthy dot once the probe resolves', async () => {
    const { container } = render(
      <HeroTelemetry probe={async () => ({ reachable: true, httpStatus: 200 })} />,
    );
    expect(await screen.findByText('live')).toBeDefined();
    expect(container.querySelector('.health-dot.healthy')).not.toBeNull();
  });

  it('reflects an unreachable API honestly as down — never a fabricated value', async () => {
    const { container } = render(
      <HeroTelemetry probe={async () => ({ reachable: false })} />,
    );
    expect(await screen.findByText('unreachable')).toBeDefined();
    expect(container.querySelector('.health-dot.down')).not.toBeNull();
  });
});
