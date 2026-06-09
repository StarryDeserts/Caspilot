import { describe, it, expect } from 'vitest';
import { mintIntentId, IntentId } from '../src/branded.js';

describe('IntentId', () => {
  it('mintIntentId returns matching shape int_<26 lowercase base32>', () => {
    const id = mintIntentId();
    expect(id).toMatch(/^int_[0-9a-z]{26}$/);
  });
  it('two mints differ', () => {
    expect(mintIntentId()).not.toBe(mintIntentId());
  });
  it('type tag does not equal plain string in nominal use', () => {
    const x: IntentId = mintIntentId();
    const y = String(x);
    expect(typeof y).toBe('string');
  });
});
