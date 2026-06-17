export interface SectionPos {
  id: string;
  top: number;
}

// The active section is the last one whose document-top has scrolled at or above
// a probe line `offset` px below the viewport top. Sections must be in document
// order; once one sits below the line, every later one does too, so we can stop.
export function pickActiveSection(
  sections: SectionPos[],
  scrollY: number,
  offset: number,
): string | null {
  if (sections.length === 0) return null;
  const probe = scrollY + offset;
  let active = sections[0]!.id;
  for (const s of sections) {
    if (s.top <= probe) active = s.id;
    else break;
  }
  return active;
}
