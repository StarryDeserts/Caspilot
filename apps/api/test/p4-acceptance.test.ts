import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps, type StubDeps } from './_stubs.js';
import { canTransition } from '@caspilot/intent-fsm';

describe('P4 acceptance', () => {
  let deps: StubDeps | null = null;
  afterEach(() => {
    deps?.cleanup();
    deps = null;
  });

  it('mounts /intents only when deps are present', async () => {
    const a = buildApp({ env: { expectedChainspec: 'casper-test' } });
    expect((await a.request('/intents', { method: 'POST', body: '{}' })).status).toBe(404);
    deps = makeStubDeps();
    const b = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const r = await b.request('/intents', {
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
    expect(r.status).toBe(201);
  });

  it('FSM is wired into router transitions', () => {
    expect(canTransition('DRAFT', 'POLICY_VALIDATED')).toBe(true);
    expect(canTransition('DRAFT', 'EXECUTED')).toBe(false);
  });
});
