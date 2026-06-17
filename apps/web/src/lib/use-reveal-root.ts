'use client';
import { useEffect, useRef } from 'react';
import { heroRevealDelayMs, prefersReducedMotion } from './reveal.js';

// Progressive-enhancement reveal for the landing page. SSR-safe by construction:
// the markup renders fully visible, and the opacity:0 initial state only applies
// once this hook adds `reveal-armed` to the root on the client — so a no-JS or
// crawler render never hides content. If the visitor prefers reduced motion we
// arm nothing: the page stays visible and static.
//
// Two reveal channels, both keyed off the already-tested pure helpers:
//   • hero load stagger — every [data-d] child reveals at heroRevealDelayMs(d)
//   • scroll reveal      — every [data-reveal] child reveals as it crosses in,
//                          staggered within each intersecting batch
export function useRevealRoot<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (prefersReducedMotion()) return; // honor the OS setting: no arming, no motion

    root.classList.add('reveal-armed');

    const timers: number[] = [];
    root.querySelectorAll<HTMLElement>('[data-d]').forEach((el) => {
      const d = Number(el.getAttribute('data-d')) || 0;
      timers.push(window.setTimeout(() => el.classList.add('in'), heroRevealDelayMs(d)));
    });

    const revealItems = root.querySelectorAll<HTMLElement>('[data-reveal]');
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(
        (entries, obs) => {
          let k = 0;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target as HTMLElement;
            timers.push(window.setTimeout(() => el.classList.add('in'), k * 60));
            k += 1;
            obs.unobserve(el);
          }
        },
        { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
      );
      revealItems.forEach((el) => io?.observe(el));
    } else {
      // No IntersectionObserver: reveal everything rather than strand it hidden.
      revealItems.forEach((el) => el.classList.add('in'));
    }

    return () => {
      for (const t of timers) window.clearTimeout(t);
      io?.disconnect();
    };
  }, []);

  return ref;
}
