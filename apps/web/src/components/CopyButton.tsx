'use client';
import { useEffect, useRef, useState } from 'react';

// A copy-to-clipboard affordance with a transient ✓ confirmation. The visible
// label doubles as the accessible name; when used icon-only (no label) the
// accessible name falls back to "copy" so the control is never anonymous.
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      className={`copy-btn${copied ? ' copied' : ''}`}
      onClick={onClick}
      aria-label={label ?? 'copy'}
    >
      {copied ? (
        <span aria-hidden="true">✓</span>
      ) : (
        <>
          <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
