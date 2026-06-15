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
});
