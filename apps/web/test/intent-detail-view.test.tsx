import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { IntentDetailView, type IntentDetailApi } from '../src/components/IntentDetailView.js';
import type { TraceEntry } from '../src/lib/api.js';

const ID = 'int_smoke_1';
const PK = '01' + 'ab'.repeat(32);

// The exact shape the live API emits for a freshly-created DRAFT intent: a single
// `created` row whose payload.body carries the proposed transfer. This is the
// contract the page's client render path depends on end to end.
function draftTrace(): { entries: TraceEntry[] } {
  return {
    entries: [
      {
        intentId: ID,
        state: 'DRAFT',
        atMs: 1_781_595_003_984,
        kind: 'created',
        payload: {
          body: {
            agent: 'agent-alpha',
            receiver: '01'.repeat(32),
            token: 'USDC',
            contract: 'cep18-usdc',
            network: 'casper-test',
            amount: '25.00',
          },
        },
        redacted: false,
      },
    ],
  };
}

// A trace whose latest state is POLICY_VALIDATED — the only state that exposes the
// live co-sign button. Body is carried on the original `created` row.
function validatedTrace(): { entries: TraceEntry[] } {
  return {
    entries: [
      ...draftTrace().entries,
      {
        intentId: ID,
        state: 'POLICY_VALIDATED',
        atMs: 1_781_595_004_000,
        kind: 'policy_check',
        payload: { allowed: true, policyDigest: 'sha256:demo' },
        redacted: false,
      },
    ],
  };
}

const HEADER_JSON = { deploy: { header: { account: PK } } };

function fakeApi(over: Partial<IntentDetailApi> = {}): IntentDetailApi {
  return {
    getTrace: vi.fn(async () => draftTrace()),
    validatePolicy: vi.fn(async () => ({ id: ID, state: 'POLICY_VALIDATED' })),
    markExecuted: vi.fn(async (_id: string, deployHash: string) => ({
      id: ID,
      state: 'EXECUTED',
      deployHash,
    })),
    reject: vi.fn(async () => ({ id: ID, state: 'REJECTED' })),
    buildUnsignedDeploy: vi.fn(async () => ({
      envelope: { headerJson: HEADER_JSON, bodyHashHex: 'bb'.repeat(16), payloadHex: 'cc'.repeat(8) },
    })),
    confirmOnchain: vi.fn(async (_id: string, deployHash: string) => ({
      id: ID,
      state: 'EXECUTED',
      deployHash,
    })),
    ...over,
  };
}

// The wallet seam IntentDetailView consumes: a connected account + a signAndSubmit
// that (in the real app) pops the CSPR.click wallet and broadcasts. Tests inject a
// fake so the orchestration runs in jsdom with no SDK and no chain.
type FakeWallet = NonNullable<Parameters<typeof IntentDetailView>[0]['wallet']>;
function fakeWallet(over: Partial<FakeWallet> = {}): FakeWallet {
  return {
    account: { publicKey: PK },
    signAndSubmit: vi.fn(async () => ({
      deployHash: 'dd'.repeat(32),
      transactionHash: null,
      cancelled: false,
      error: null,
      status: 'sent',
    })),
    ...over,
  };
}

describe('IntentDetailView (client render path)', () => {
  it('renders the populated DRAFT page from a live-shaped trace and wires the validate action', async () => {
    const api = fakeApi();
    const { container } = render(<IntentDetailView id={ID} api={api} />);

    // The id is surfaced verbatim in the breadcrumb.
    expect(container.querySelector('.breadcrumb .id')?.textContent).toBe(ID);

    // After the hook's first getTrace resolves, the header badge shows DRAFT (lg).
    const badge = await waitFor(() => {
      const el = container.querySelector('.badge.lg');
      if (!el || !/DRAFT/.test(el.textContent ?? '')) throw new Error('not yet');
      return el;
    });
    expect(badge.textContent).toMatch(/DRAFT/);

    // The proposed-intent panel reflects the body from payload.body.
    expect(screen.getByText('agent-alpha')).toBeTruthy();
    expect(screen.getByText('25.00')).toBeTruthy();

    // DRAFT gating: the one offered action is Validate policy; clicking it calls
    // the injected client with the intent id.
    const validate = screen.getByRole('button', { name: /validate policy/i });
    await act(async () => {
      fireEvent.click(validate);
    });
    expect(api.validatePolicy).toHaveBeenCalledWith(ID);

    // getTrace was actually invoked with the id (the hook is live).
    expect(api.getTrace).toHaveBeenCalledWith(ID);
  });

  it('renders an honest not-found card when getTrace 404s, with no write actions', async () => {
    const api = fakeApi({
      getTrace: vi.fn(async () => {
        throw new Error('getTrace 404: no such intent');
      }),
    });
    const { container } = render(<IntentDetailView id={ID} api={api} />);

    await screen.findByText(/intent not found/i);
    expect(container.querySelector('.fail-card.notfound')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /validate policy/i })).toBeNull();
    expect(container.querySelector('.badge.lg')).toBeNull();
  });
});

describe('IntentDetailView — live co-sign orchestration', () => {
  it('happy path: builds unsigned deploy with the connected pk, signs via wallet, confirms the real hash on-chain', async () => {
    const HASH = 'dd'.repeat(32);
    const api = fakeApi({ getTrace: vi.fn(async () => validatedTrace()) });
    const wallet = fakeWallet();
    render(<IntentDetailView id={ID} api={api} wallet={wallet} />);

    const sign = await screen.findByRole('button', { name: /submit on testnet/i });
    await act(async () => {
      fireEvent.click(sign);
    });

    // 1. unsigned deploy is built FOR the user's connected key (user pays).
    expect(api.buildUnsignedDeploy).toHaveBeenCalledWith(ID, PK);
    // 2. the backend-built Deploy JSON is handed straight to the wallet.
    expect(wallet.signAndSubmit).toHaveBeenCalledWith(HEADER_JSON);
    // 3. only the REAL broadcast hash is confirmed on-chain — never fabricated.
    await waitFor(() => {
      expect(api.confirmOnchain).toHaveBeenCalledWith(ID, HASH);
    });
  });

  it('prefers the canonical transactionHash over deployHash when the wallet returns both', async () => {
    // A Casper 2.0 native transfer resolves as a TransactionV1: the wallet reports
    // the canonical transactionHash AND a legacy deployHash. The view must verify the
    // CANONICAL hash on-chain so the proof links /transaction/, not /deploy/.
    const TXH = 'ee'.repeat(32);
    const api = fakeApi({ getTrace: vi.fn(async () => validatedTrace()) });
    const wallet = fakeWallet({
      signAndSubmit: vi.fn(async () => ({
        deployHash: 'dd'.repeat(32),
        transactionHash: TXH,
        cancelled: false,
        error: null,
        status: 'sent',
      })),
    });
    render(<IntentDetailView id={ID} api={api} wallet={wallet} />);

    const sign = await screen.findByRole('button', { name: /submit on testnet/i });
    await act(async () => {
      fireEvent.click(sign);
    });

    await waitFor(() => {
      expect(api.confirmOnchain).toHaveBeenCalledWith(ID, TXH);
    });
  });

  it('treats a CSPR.click timeout that still carries a hash as a broadcast → verifies on-chain (not an error)', async () => {
    // status:'timeout' means CSPR.click stopped MONITORING before finalization — but
    // the tx was already broadcast and a hash exists. The flow must verify that hash
    // on-chain (the backend is the source of truth on finality), NOT surface an error.
    const TXH = 'ee'.repeat(32);
    const api = fakeApi({ getTrace: vi.fn(async () => validatedTrace()) });
    const wallet = fakeWallet({
      signAndSubmit: vi.fn(async () => ({
        deployHash: null,
        transactionHash: TXH,
        cancelled: false,
        error: 'timeout',
        status: 'timeout',
      })),
    });
    const { container } = render(<IntentDetailView id={ID} api={api} wallet={wallet} />);

    const sign = await screen.findByRole('button', { name: /submit on testnet/i });
    await act(async () => {
      fireEvent.click(sign);
    });

    await waitFor(() => {
      expect(api.confirmOnchain).toHaveBeenCalledWith(ID, TXH);
    });
    expect(container.querySelector('.err-text')).toBeNull();
  });

  it('cancel: a rejected wallet popup stops the flow — no on-chain confirm, no surfaced error', async () => {
    const api = fakeApi({ getTrace: vi.fn(async () => validatedTrace()) });
    const wallet = fakeWallet({
      signAndSubmit: vi.fn(async () => ({
        deployHash: null,
        transactionHash: null,
        cancelled: true,
        error: null,
        status: 'cancelled',
      })),
    });
    const { container } = render(<IntentDetailView id={ID} api={api} wallet={wallet} />);

    const sign = await screen.findByRole('button', { name: /submit on testnet/i });
    await act(async () => {
      fireEvent.click(sign);
    });

    expect(wallet.signAndSubmit).toHaveBeenCalledTimes(1);
    expect(api.confirmOnchain).not.toHaveBeenCalled();
    expect(container.querySelector('.err-text')).toBeNull();
  });

  it('error: a broadcast error surfaces under the actions and skips on-chain confirm', async () => {
    const api = fakeApi({ getTrace: vi.fn(async () => validatedTrace()) });
    const wallet = fakeWallet({
      signAndSubmit: vi.fn(async () => ({
        deployHash: null,
        transactionHash: null,
        cancelled: false,
        error: 'wallet rpc: insufficient balance',
        status: null,
      })),
    });
    const { container } = render(<IntentDetailView id={ID} api={api} wallet={wallet} />);

    const sign = await screen.findByRole('button', { name: /submit on testnet/i });
    await act(async () => {
      fireEvent.click(sign);
    });

    await waitFor(() => {
      const err = container.querySelector('.err-text');
      if (!err) throw new Error('not yet');
      expect(err.textContent).toContain('insufficient balance');
    });
    expect(api.confirmOnchain).not.toHaveBeenCalled();
  });

  it('links the on-chain proof to /transaction/<hash> when the executed trace resolved as a Casper 2.0 transaction', async () => {
    // End-to-end provenance: the verifier-resolved hashKind on the EXECUTED row flows
    // deriveIntent → IntentDetailView → OnChainProofPanel so the proof links the
    // CANONICAL /transaction/ URL. Linking /deploy/ for a V1 would 404 on cspr.live.
    const TXH = 'ee'.repeat(32);
    const executedTxTrace = {
      entries: [
        ...validatedTrace().entries,
        {
          intentId: ID,
          state: 'EXECUTED',
          atMs: 1_781_595_005_000,
          kind: 'execution',
          payload: { deployHash: TXH, hashKind: 'transaction', signerRole: 'user_cspr_click' },
          redacted: false,
        },
      ],
    };
    const api = fakeApi({ getTrace: vi.fn(async () => executedTxTrace) });
    const { container } = render(<IntentDetailView id={ID} api={api} />);

    const link = await waitFor(() => {
      const a = container.querySelector('a.proof-link') as HTMLAnchorElement | null;
      if (!a) throw new Error('not yet');
      return a;
    });
    expect(link.getAttribute('href')).toBe(`https://testnet.cspr.live/transaction/${TXH}`);
  });
});
