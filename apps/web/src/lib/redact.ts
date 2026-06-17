// Belt-and-suspenders client redaction. The server already strips secrets and
// agent reasoning from trace payloads (and reports a per-row `redacted` flag),
// but the UI re-strips defensively so a server regression can never surface a
// forbidden key in the DOM. This is the single source of truth for that key set.
export const FRONTEND_FORBIDDEN_KEYS = new Set([
  'privateKey',
  'PRIVATE_KEY',
  'mnemonic',
  'seed',
  'apiKey',
  'API_KEY',
  'CSPR_CLOUD_KEY',
  'reasoning',
  'chainOfThought',
  'prompt',
  'env',
]);

export function sanitize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FRONTEND_FORBIDDEN_KEYS.has(k)) continue;
    out[k] = sanitize(v);
  }
  return out;
}
