'use client';
import { useEffect, useState } from 'react';
import { pickActiveSection, type SectionPos } from './scroll-spy.js';

// Probe line ~one topbar-height into the viewport. A section becomes "active"
// once its top scrolls above this line. Thin DOM adapter over pickActiveSection
// (which holds the tested logic); jsdom has no layout so this no-ops in tests.
const PROBE_OFFSET = 96;

export function useScrollSpy(ids: readonly string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');

  useEffect(() => {
    if (ids.length === 0) return;
    const measure = () => {
      const positions: SectionPos[] = [];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) positions.push({ id, top: el.getBoundingClientRect().top + window.scrollY });
      }
      const next = pickActiveSection(positions, window.scrollY, PROBE_OFFSET);
      if (next) setActive(next);
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [ids]);

  return active;
}
