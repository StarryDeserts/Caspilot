import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps } from './_stubs.js';

describe('POST /intents', () => {
  it('creates a DRAFT intent and returns id', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps: makeStubDeps() });
    const res = await app.request('/intents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: '00' + 'aa'.repeat(32),
        receiver: '00' + 'bb'.repeat(32),
        token: 'cspr-test-cep18',
        contract: '00' + 'cc'.repeat(32),
        network: 'casper:casper-test',
        amount: '500',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; state: string };
    expect(body.id).toMatch(/^int_/);
    expect(body.state).toBe('DRAFT');
  });
});
