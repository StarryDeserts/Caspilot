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
    if (!res.ok) throw await this.error('createIntent', res);
    return (await res.json()) as CreateIntentResponse;
  }

  async validatePolicy(id: string): Promise<{ id: string; state: string }> {
    const res = await this.fetcher(`${this.baseUrl}/intents/${encodeURIComponent(id)}/validate-policy`, { method: 'POST' });
    if (!res.ok) throw await this.error('validatePolicy', res);
    return (await res.json()) as { id: string; state: string };
  }

  async getTrace(id: string): Promise<{ entries: TraceEntry[] }> {
    const res = await this.fetcher(`${this.baseUrl}/intents/${encodeURIComponent(id)}/trace`);
    if (!res.ok) throw await this.error('getTrace', res);
    return (await res.json()) as { entries: TraceEntry[] };
  }

  async reject(id: string, reason: string): Promise<{ id: string; state: string }> {
    const res = await this.fetcher(`${this.baseUrl}/intents/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw await this.error('reject', res);
    return (await res.json()) as { id: string; state: string };
  }

  // Surface the server's response body (e.g. a 403/409 authorization reason)
  // instead of masking it behind a bare status code.
  private async error(label: string, res: Response): Promise<Error> {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      // body unavailable; the status alone still informs the caller
    }
    return new Error(detail ? `${label} ${res.status}: ${detail}` : `${label} ${res.status}`);
  }
}
