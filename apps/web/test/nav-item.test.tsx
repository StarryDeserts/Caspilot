import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { NavItem } from '../src/components/NavItem.js';

describe('NavItem', () => {
  it('renders an inactive link without the active class or aria-current', () => {
    const { container } = render(<NavItem href="/intents" label="Intents" />);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('/intents');
    expect(a?.className).toContain('nav-item');
    expect(a?.className).not.toContain('active');
    expect(a?.getAttribute('aria-current')).toBeNull();
    expect(a?.textContent).toContain('Intents');
  });

  it('marks the active link with the active class + aria-current=page', () => {
    const { container } = render(<NavItem href="/intents" label="Intents" active />);
    const a = container.querySelector('a');
    expect(a?.className).toContain('active');
    expect(a?.getAttribute('aria-current')).toBe('page');
  });
});
