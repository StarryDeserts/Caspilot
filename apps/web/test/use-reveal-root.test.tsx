import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRevealRoot } from '../src/lib/use-reveal-root.js';

// The reveal hook hides content (opacity:0) only via the `.reveal-armed` class
// it adds on the client. Under prefers-reduced-motion it must arm NOTHING, or
// the scoped `.reveal-armed [data-d] { opacity:0 }` rule would strand the page
// invisible with no animation ever to bring it back. This guards that invariant
// directly — the only safety net, since the visual result can't be checked on a
// headless box.
function Harness() {
  const ref = useRevealRoot<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="root" className="landing">
      <span data-d="0">hero</span>
    </div>
  );
}

function stubMatchMedia(matches: boolean) {
  (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    matches,
    media: q,
  });
}

describe('useRevealRoot', () => {
  const orig = window.matchMedia;
  afterEach(() => {
    (window as unknown as { matchMedia: unknown }).matchMedia = orig;
  });

  it('does not arm the reveal (content stays visible) under reduced motion', () => {
    stubMatchMedia(true);
    render(<Harness />);
    expect(screen.getByTestId('root').classList.contains('reveal-armed')).toBe(false);
  });

  it('arms the reveal when motion is allowed', () => {
    stubMatchMedia(false);
    render(<Harness />);
    expect(screen.getByTestId('root').classList.contains('reveal-armed')).toBe(true);
  });
});
