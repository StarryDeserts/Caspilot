export interface CreateIntentBody {
  agent: string;
  receiver: string;
  token: string;
  contract: string;
  network: string;
  amount: string;
}

export interface CreateIntentResponse {
  id: string;
  state: string;
}

export interface TraceEntry {
  intentId: string;
  state: string;
  atMs: number;
  kind: string;
  payload?: unknown;
}

export interface CaspilotApiOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export class CaspilotApi {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(opts: CaspilotApiOptions) {
    if (!opts.baseUrl) throw new Error('baseUrl is required');
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetcher = opts.fetch ?? globalThis.fetch;
  }

  async createIntent(body: CreateIntentBody): Promise<CreateIntentResponse> {
    const res = await this.fetcher(`${this.baseUrl}/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`createIntent ${res.status}`);
    return (await res.json()) as CreateIntentResponse;
  }

  async validatePolicy(id: string): Promise<{ id: string; state: string }> {
    const res = await this.fetcher(`${this.baseUrl}/intents/${id}/validate-policy`, { method: 'POST' });
    if (!res.ok) throw new Error(`validatePolicy ${res.status}`);
    return (await res.json()) as { id: string; state: string };
  }

  async getTrace(id: string): Promise<{ entries: TraceEntry[] }> {
    const res = await this.fetcher(`${this.baseUrl}/intents/${id}/trace`);
    if (!res.ok) throw new Error(`getTrace ${res.status}`);
    return (await res.json()) as { entries: TraceEntry[] };
  }

  async reject(id: string, reason: string): Promise<{ id: string; state: string }> {
    const res = await this.fetcher(`${this.baseUrl}/intents/${id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error(`reject ${res.status}`);
    return (await res.json()) as { id: string; state: string };
  }
}
