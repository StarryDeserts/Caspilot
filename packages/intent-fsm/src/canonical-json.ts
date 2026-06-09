export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as object).sort();
    return keys.reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = canonicalize((value as Record<string, unknown>)[k]);
      return acc;
    }, {});
  }
  return value;
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
