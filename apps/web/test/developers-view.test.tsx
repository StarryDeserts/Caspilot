import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEV_SECTIONS } from '../src/lib/dev-sections.js';
import { DevelopersView } from '../src/components/DevelopersView.js';

describe('DevelopersView', () => {
  it('renders the slim topbar with brand, env, and a Launch console CTA to /console', () => {
    const { getAllByText, getByText, getByRole } = render(<DevelopersView />);
    expect(getAllByText('Caspilot').length).toBeGreaterThan(0); // topbar + footer
    expect(getByText('casper:casper-test')).toBeTruthy(); // the env chip, exact text
    const cta = getByRole('link', { name: /launch console/i });
    expect(cta.getAttribute('href')).toBe('/console');
  });

  it('keeps the anchor nav and the content sections perfectly in sync', () => {
    // The guard against the open-design bug: the source hand-wrote the nav and
    // dropped #reject. Both nav links and sections derive from DEV_SECTIONS, so
    // every documented section must have BOTH a section element and a nav link.
    const { container } = render(<DevelopersView />);
    for (const { id } of DEV_SECTIONS) {
      expect(container.querySelector(`section#${id}`), `section#${id}`).toBeTruthy();
      expect(container.querySelector(`a[href="#${id}"]`), `nav link #${id}`).toBeTruthy();
    }
    // explicit: the section the source forgot
    expect(container.querySelector('a[href="#reject"]')).toBeTruthy();
  });

  it('renders the x402 flow as a connector track with a retry-loop hint (revision 1)', () => {
    const { container, getByText } = render(<DevelopersView />);
    expect(container.querySelector('.flow-track')).toBeTruthy();
    expect(container.querySelectorAll('.fnode').length).toBe(4);
    expect(getByText(/same endpoint/i)).toBeTruthy();
  });

  it('gives endpoints an external request line and full pasteable example values (revision 2)', () => {
    const { container, getByText, getAllByText } = render(<DevelopersView />);
    expect(container.querySelector('.req-line')).toBeTruthy();
    // full-length values, not "00aa…" / "int_3hdp2en…" ellipses
    expect(getByText('00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBeTruthy();
    expect(getAllByText('int_3hdp2enbaqglke1jv7e1avk3d9').length).toBeGreaterThan(0);
    // copy affordances on the code blocks
    const copies = container.querySelectorAll('.copy-btn');
    expect(copies.length).toBeGreaterThanOrEqual(5);
  });

  it('renders the errors table with a Recover column and neutral status badges (revision 3)', () => {
    const { container, getByText } = render(<DevelopersView />);
    expect(getByText('Recover')).toBeTruthy();
    expect(container.querySelectorAll('.estatus').length).toBe(4);
    expect(getByText(/Pay the quote, then retry the same call/i)).toBeTruthy();
    expect(getByText(/pruned ids are not recoverable/i)).toBeTruthy();
    // status colour lives on the dot inside the badge, never the cell
    expect(container.querySelector('.estatus.e402 .ed')).toBeTruthy();
  });

  it('keeps the structural security guarantees', () => {
    const { getByText } = render(<DevelopersView />);
    expect(getByText('Signer separation')).toBeTruthy();
    expect(getByText('Redacted trace')).toBeTruthy();
    expect(getByText(/Replay-protected payment ledger/i)).toBeTruthy();
    expect(getByText(/No secrets in client bundles/i)).toBeTruthy();
  });
});
