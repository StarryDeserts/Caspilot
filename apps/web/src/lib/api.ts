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
  // Honest per-row signal from the server: true iff a forbidden key was actually
  // stripped. The redacted chip renders only when this is true — never fabricated.
  redacted?: boolean;
}

export interface IntentSummary {
  id: string;
  state: string;
  agent: string;
  receiver: string;
  token: string;
  contract: string;
  network: string;
  amount: string;
  updatedAtMs: number;
}

export interface ValidatePolicyResult {
  id: string;
  state: string;
  code?: string;
  policyDigest?: string;
}

export interface MarkExecutedResult {
  id: string;
  state: string;
  deployHash: string;
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

  async listIntents(): Promise<IntentSummary[]> {
    const res = await this.fetcher(`${this.baseUrl}/intents`);
    if (!res.ok) throw await this.error('listIntents', res);
    const body = (await res.json()) as { intents: IntentSummary[] };
    return body.intents;
  }

  async validatePolicy(id: string): Promise<ValidatePolicyResult> {
    const res = await this.fetcher(
      `${this.baseUrl}/intents/${encodeURIComponent(id)}/validate-policy`,
      { method: 'POST' },
    );
    // 422 is a structured policy denial, not a transport failure: return the
    // {state:'REJECTED', code} body so the UI renders the rejection inline
    // instead of catching a thrown error as a generic toast.
    if (res.status === 422) return (await res.json()) as ValidatePolicyResult;
    if (!res.ok) throw await this.error('validatePolicy', res);
    return (await res.json()) as ValidatePolicyResult;
  }

  async markExecuted(id: string, deployHash: string): Promise<MarkExecutedResult> {
    const res = await this.fetcher(
      `${this.baseUrl}/intents/${encodeURIComponent(id)}/mark-executed`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deployHash }),
      },
    );
    if (!res.ok) throw await this.error('markExecuted', res);
    return (await res.json()) as MarkExecutedResult;
  }

  // Tolerant liveness probe for the marketing surface: never throws. A non-2xx
  // is reported as reachable+degraded (a value to render), a transport failure
  // as unreachable — so a down API degrades the hero telemetry instead of
  // crashing an unauthenticated public page.
  async health(): Promise<{ reachable: boolean; httpStatus?: number }> {
    try {
      const res = await this.fetcher(`${this.baseUrl}/healthz`);
      return { reachable: true, httpStatus: res.status };
    } catch {
      return { reachable: false };
    }
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
