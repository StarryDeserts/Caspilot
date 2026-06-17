import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { Sidebar } from '../src/components/Sidebar.js';

describe('Sidebar', () => {
  it('marks exactly the nav item matching the pathname active, including nested routes', () => {
    const { container } = render(<Sidebar pathname="/intents/abc123" />);
    const active = container.querySelectorAll('a.nav-item.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent).toContain('Intents');
  });

  it('treats /console as the Dashboard active route', () => {
    const { container } = render(<Sidebar pathname="/console" />);
    const active = container.querySelector('a.nav-item.active');
    expect(active?.textContent).toContain('Dashboard');
  });

  it('renders the brand glyph, wordmark, tagline, and env footer', () => {
    const { container } = render(<Sidebar pathname="/console" />);
    expect(container.querySelector('.brand svg')).not.toBeNull();
    expect(container.textContent).toContain('Caspilot');
    expect(container.textContent).toContain('autonomy you can audit');
    expect(container.textContent).toContain('casper:casper-test');
  });

  it('adds the open modifier class for the mobile drawer', () => {
    const { container } = render(<Sidebar pathname="/console" open />);
    expect(container.querySelector('aside.sidebar')?.className).toContain('open');
  });
});
