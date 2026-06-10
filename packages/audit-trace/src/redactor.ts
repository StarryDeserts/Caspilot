export const FORBIDDEN_KEYS = [
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
] as const;

const FORBIDDEN_SET = new Set<string>(FORBIDDEN_KEYS);

// Intentionally accepts class instances so their fields are walked and forbidden keys stripped; a stricter `Object.getPrototypeOf(x) === Object.prototype` check would silently let class-instance secrets through.
function isPlainObject(x: unknown): x is Record<string, unknown> {
  return Object.prototype.toString.call(x) === '[object Object]';
}

export class PlannerRedactor {
  redact(input: Record<string, unknown>): Record<string, unknown> {
    if (input === null || input === undefined) {
      throw new Error('PlannerRedactor.redact requires an object');
    }
    return this.walk(input) as Record<string, unknown>;
  }

  private walk(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
    if (Buffer.isBuffer(value)) return '[buffer:redacted]';
    if (Array.isArray(value)) {
      if (seen.has(value)) return '[cycle:redacted]';
      seen.add(value);
      return value.map((v) => this.walk(v, seen));
    }
    if (isPlainObject(value)) {
      if (seen.has(value)) return '[cycle:redacted]';
      seen.add(value);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (FORBIDDEN_SET.has(k)) continue;
        out[k] = this.walk(v, seen);
      }
      return out;
    }
    return value;
  }
}
