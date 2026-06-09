export interface CsprCloudOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class CsprCloudAdapter {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(opts: CsprCloudOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, accept: 'application/json' };
  }

  async healthCheck(): Promise<
    { name: 'cspr-cloud'; ok: true } | { name: 'cspr-cloud'; ok: false; reason: string }
  > {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.base}/healthz`, {
        headers: this.headers(),
        signal: ctl.signal,
      });
      if (!res.ok) return { name: 'cspr-cloud', ok: false, reason: `http_${res.status}` };
      return { name: 'cspr-cloud', ok: true };
    } catch (e) {
      return {
        name: 'cspr-cloud',
        ok: false,
        reason: String(e instanceof Error ? e.message : e),
      };
    } finally {
      clearTimeout(t);
    }
  }

  async getAccountBalance(accountHash: string): Promise<string> {
    const res = await this.fetchImpl(`${this.base}/accounts/${accountHash}/balance`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const json = (await res.json()) as { balance: string };
    return json.balance;
  }
}
