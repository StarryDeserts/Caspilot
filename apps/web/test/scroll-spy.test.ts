import { describe, expect, it } from 'vitest';
import { pickActiveSection, type SectionPos } from '../src/lib/scroll-spy.js';

// A deterministic, layout-free replacement for the open-design IntersectionObserver
// scroll-spy: given each section's document-top and the current scroll position,
// the active section is the LAST one whose top has crossed a probe line `offset`
// pixels below the viewport top. Pure -> unit-testable (IO never fires in jsdom).
const SECTIONS: SectionPos[] = [
  { id: 'overview', top: 0 },
  { id: 'auth', top: 500 },
  { id: 'flow', top: 1000 },
];

describe('pickActiveSection', () => {
  it('returns null when there are no sections', () => {
    expect(pickActiveSection([], 0, 80)).toBeNull();
  });

  it('selects the first section at the top of the page', () => {
    expect(pickActiveSection(SECTIONS, 0, 80)).toBe('overview');
  });

  it('selects the section whose top has scrolled above the probe line', () => {
    // probe = scrollY(460) + offset(80) = 540 -> auth(500) crossed, flow(1000) not
    expect(pickActiveSection(SECTIONS, 460, 80)).toBe('auth');
  });

  it('treats the boundary (top === probe line) as crossed', () => {
    // probe = 420 + 80 = 500 === auth.top -> auth is active (inclusive >=)
    expect(pickActiveSection(SECTIONS, 420, 80)).toBe('auth');
  });

  it('keeps the last section active once scrolled past everything', () => {
    expect(pickActiveSection(SECTIONS, 5000, 80)).toBe('flow');
  });
});
