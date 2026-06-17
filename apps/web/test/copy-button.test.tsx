import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CopyButton } from '../src/components/CopyButton.js';

describe('CopyButton', () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a button with the given label as its accessible name and visible text', () => {
    render(<CopyButton text="int_x" label="copy id" />);
    const btn = screen.getByRole('button', { name: /copy id/i });
    expect(btn.textContent).toContain('copy id');
  });

  it('writes the exact text to the clipboard on click', () => {
    render(<CopyButton text="int_abc" label="copy id" />);
    fireEvent.click(screen.getByRole('button', { name: /copy id/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('int_abc');
  });

  it('shows a confirmation tick + copied class after click, then reverts after 1200ms', () => {
    const { container } = render(<CopyButton text="int_abc" label="copy id" />);
    const btn = screen.getByRole('button', { name: /copy id/i });

    fireEvent.click(btn);
    expect(container.querySelector('.copy-btn.copied')).not.toBeNull();
    expect(btn.textContent).toContain('✓');

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(container.querySelector('.copy-btn.copied')).toBeNull();
    expect(btn.textContent).not.toContain('✓');
    expect(btn.textContent).toContain('copy id');
  });

  it('keeps an accessible name even when icon-only (no label text)', () => {
    render(<CopyButton text="deadbeef" />);
    // getByRole throws if no accessible name resolves — this asserts one exists.
    expect(screen.getByRole('button', { name: /copy/i })).toBeDefined();
  });
});
