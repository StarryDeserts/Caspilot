import { describe, it, expect, vi } from 'vitest';
import { CaspilotApi } from '../src/lib/api.js';

describe('CaspilotApi', () => {
  it('targets only NEXT_PUBLIC_CASPILOT_API_BASE', async () => {
    const fetchMock = vi.fn(
      async (url: string) =>
        new Response(JSON.stringify({ id: 'int_abc', state: 'DRAFT' }), { status: 201 }),
    );
    const api = new CaspilotApi({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await api.createIntent({
      agent: '00' + 'aa'.repeat(32),
      receiver: '00' + 'bb'.repeat(32),
      token: 'cspr-cep18',
      contract: '00' + 'cc'.repeat(32),
      network: 'casper:casper-test',
      amount: '100',
    });
    expect(r.id).toBe('int_abc');
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/intents');
  });

  it('throws if baseUrl is empty', () => {
    expect(() => new CaspilotApi({ baseUrl: '' })).toThrow(/baseUrl/);
  });

  it('GET /intents/:id/trace returns redacted trace from server', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ entries: [] }), { status: 200 }),
    );
    const api = new CaspilotApi({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await api.getTrace('int_abc');
    expect(r.entries).toEqual([]);
  });

  it('getTrace surfaces the per-row redacted flag from the server', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            entries: [
              {
                atMs: 1,
                state: 'POLICY_VALIDATED',
                kind: 'policy_check',
                payload: { allowed: true },
                redacted: false,
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const api = new CaspilotApi({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await api.getTrace('int_abc');
    expect(r.entries[0]?.redacted).toBe(false);
  });

  it('listIntents() GETs /intents and unwraps the envelope to an array', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ intents: [{ id: 'int_a', state: 'DRAFT', updatedAtMs: 2 }] }),
          { status: 200 },
        ),
    );
    const api = new CaspilotApi({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const rows = await api.listIntents();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/intents');
    expect(rows).toEqual([{ id: 'int_a', state: 'DRAFT', updatedAtMs: 2 }]);
  });

  it('markExecuted() POSTs the deployHash to mark-executed', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'int_a', state: 'EXECUTED', deployHash: 'ab'.repeat(32) }), {
          status: 200,
        }),
    );
    const api = new CaspilotApi({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await api.markExecuted('int_a', 'ab'.repeat(32));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/intents/int_a/mark-executed');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ deployHash: 'ab'.repeat(32) });
    expect(r.state).toBe('EXECUTED');
  });

  it('validatePolicy() returns the structured rejection on 422 instead of throwing', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'int_a', state: 'REJECTED', code: 'receiver_not_allowed' }), {
          status: 422,
        }),
    );
    const api = new CaspilotApi({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await api.validatePolicy('int_a');
    expect(r).toMatchObject({ state: 'REJECTED', code: 'receiver_not_allowed' });
  });

  it('validatePolicy() returns POLICY_VALIDATED on 200', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'int_a', state: 'POLICY_VALIDATED', policyDigest: 'dig' }), {
          status: 200,
        }),
    );
    const api = new CaspilotApi({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await api.validatePolicy('int_a');
    expect(r.state).toBe('POLICY_VALIDATED');
  });

  it('validatePolicy() still throws on non-422 errors (e.g. 404)', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }),
    );
    const api = new CaspilotApi({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(api.validatePolicy('int_missing')).rejects.toThrow(/validatePolicy 404/);
  });
});
