export interface DevSection {
  id: string;
  label: string;
}

// Single source of truth: the developers page renders BOTH its anchor nav and its
// section order from this array, so the nav can never drift out of sync with the
// content (the open-design source did exactly that — it dropped the #reject link).
export const DEV_SECTIONS: readonly DevSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'auth', label: 'Authentication' },
  { id: 'flow', label: 'The x402 flow' },
  { id: 'create', label: 'Create intent' },
  { id: 'validate', label: 'Validate policy' },
  { id: 'trace', label: 'Get trace' },
  { id: 'reject', label: 'Reject intent' },
  { id: 'errors', label: 'Errors' },
];
