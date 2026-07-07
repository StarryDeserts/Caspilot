import type { SettleRequest } from './schemas/settle.schema.js';
import type { VerifyRequest } from './schemas/verify.schema.js';

/** Thin transport over the x402 facilitator. Returns raw JSON; the gateway parses. */
export interface FacilitatorClient {
  supported(): Promise<unknown>;
  verify(body: VerifyRequest): Promise<unknown>;
  settle(body: SettleRequest): Promise<unknown>;
}

export interface HttpFacilitatorClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
}

export function makeHttpFacilitatorClient(opts: HttpFacilitatorClientOptions): FacilitatorClient {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  let base = opts.baseUrl;
  while (base.endsWith('/')) base = base.slice(0, -1);
  const authHeaders: Record<string, string> = opts.apiKey
    ? { authorization: `Bearer ${opts.apiKey}` }
    : {};

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const res = await fetchImpl(`${base}${path}`, init);
    if (!res.ok) throw new Error(`facilitator ${path} returned ${res.status}`);
    return res.json();
  }

  function postInit(body: unknown): RequestInit {
    return {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
    };
  }

  return {
    supported: () => request('/supported', { method: 'GET', headers: { ...authHeaders } }),
    verify: (body) => request('/verify', postInit(body)),
    settle: (body) => request('/settle', postInit(body)),
  };
}
