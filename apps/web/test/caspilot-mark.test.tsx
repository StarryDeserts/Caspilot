import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaspilotMark } from '../src/components/CaspilotMark.js';

describe('CaspilotMark', () => {
  it('renders an accessible heading-dial glyph named Caspilot', () => {
    render(<CaspilotMark />);
    const img = screen.getByRole('img', { name: /caspilot/i });
    expect(img.tagName.toLowerCase()).toBe('svg');
    expect(img.getAttribute('viewBox')).toBe('0 0 48 48');
  });

  it('sizes the glyph from the size prop', () => {
    const { container } = render(<CaspilotMark size={22} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('22');
    expect(svg?.getAttribute('height')).toBe('22');
  });

  it('paints only the needle and tip with the accent token; ring + pivot stay currentColor', () => {
    const { container } = render(<CaspilotMark />);
    const ring = container.querySelector('path');
    const needle = container.querySelector('polygon');
    const tip = container.querySelector('rect');
    const pivot = container.querySelector('circle');
    expect(ring?.getAttribute('stroke')).toBe('currentColor');
    expect(needle?.getAttribute('fill')).toBe('var(--accent)');
    expect(tip?.getAttribute('fill')).toBe('var(--accent)');
    expect(pivot?.getAttribute('fill')).toBe('currentColor');
  });

  it('collapses the accent to currentColor in mono mode', () => {
    const { container } = render(<CaspilotMark mono />);
    const needle = container.querySelector('polygon');
    const tip = container.querySelector('rect');
    expect(needle?.getAttribute('fill')).toBe('currentColor');
    expect(tip?.getAttribute('fill')).toBe('currentColor');
  });

  // Geometry is a design contract, not an implementation detail. The rendered
  // mockup (uiux-design/caspilot-logo-display.html) is the approved source of
  // truth and the shipped glyph matches it. The plan's §7.8 carries a DIFFERENT
  // "refined" lance geometry (ring M39.7…, 5-point angled needle) that was never
  // reconciled to the mockup; pin the approved values here so that outlier can
  // never be silently applied — visual divergence is unverifiable on this box.
  it('pins the approved heading-dial geometry from the rendered mockup', () => {
    const { container } = render(<CaspilotMark />);
    const ring = container.querySelector('path');
    expect(ring?.getAttribute('d')).toBe('M34.4 13.2 A16 16 0 1 0 34.4 34.8');
    expect(ring?.getAttribute('vector-effect')).toBe('non-scaling-stroke');

    const needle = container.querySelector('polygon');
    expect(needle?.getAttribute('points')).toBe('24,24 40.5,21.7 44,24 40.5,26.3');

    const pivot = container.querySelector('circle');
    expect(pivot?.getAttribute('cx')).toBe('24');
    expect(pivot?.getAttribute('cy')).toBe('24');
    expect(pivot?.getAttribute('r')).toBe('2.1');

    const tip = container.querySelector('rect');
    expect(tip?.getAttribute('x')).toBe('43.2');
    expect(tip?.getAttribute('y')).toBe('22.4');
    expect(tip?.getAttribute('width')).toBe('2');
    expect(tip?.getAttribute('height')).toBe('3.2');
  });
});
