import { describe, it, expect } from 'vitest';
import { INTENT_STATES } from '../src/index.js';

describe('INTENT_STATES', () => {
  it('has 12 states', () => expect(INTENT_STATES.length).toBe(12));
});
