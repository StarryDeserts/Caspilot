import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps, type StubDeps } from './_stubs.js';

describe('POST /intents', () => {
  let deps: StubDeps;
  beforeEach(() => {
    deps = makeStubDeps();
  });
  afterEach(() => {
    deps.cleanup();
  });

  it('creates a DRAFT intent and returns id', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
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

  it('returns 400 on malformed JSON', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const res = await app.request('/intents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not valid json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_json');
  });
});
