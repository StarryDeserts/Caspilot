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
});
