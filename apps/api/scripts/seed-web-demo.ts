// Seeds the running demo API (default :8787) with a spread of intents across every
// lifecycle state the UI renders, plus enough reserved+committed spend to drive the
// vault meter to ~80% (warn) against the demo day cap of 3000. Everything goes
// through the real HTTP endpoints — no direct DB writes — so the seeded state is
// exactly what the web app reads. Run AFTER starting serve-demo.ts.
//
//   pnpm --filter caspilot-api exec tsx scripts/seed-web-demo.ts

const BASE = process.env.CASPILOT_API ?? 'http://localhost:8787';

// Honest values that satisfy DEFAULT_DEMO_POLICY: allowlisted receiver/contract,
// the demo token + chain. The REJECTED rows deliberately use an off-allowlist
// receiver so policy validation denies them (422) — a real denial, not a stub.
const RECEIVER_OK = `00${'b'.repeat(64)}`;
const RECEIVER_BAD = `00${'e'.repeat(64)}`;
const CONTRACT = `00${'c'.repeat(64)}`;
const TOKEN = 'cspr-test-cep18';
const NETWORK = 'casper:casper-test';

type Lifecycle = 'draft' | 'validated' | 'executed' | 'rejected';
interface Plan {
  label: string;
  amount: string;
  lifecycle: Lifecycle;
}

// committed (executed) 1850 + reserved (validated) 550 = 2400 / 3000 = 80.0%.
const PLAN: Plan[] = [
  { label: 'yield rebalance → Aave', amount: '500', lifecycle: 'executed' },
  { label: 'LP top-up → pool', amount: '500', lifecycle: 'executed' },
  { label: 'fee sweep → treasury', amount: '450', lifecycle: 'executed' },
  { label: 'reward claim payout', amount: '400', lifecycle: 'executed' },
  { label: 'pending swap → router', amount: '350', lifecycle: 'validated' },
  { label: 'staged withdrawal', amount: '200', lifecycle: 'validated' },
  { label: 'draft: rent payment', amount: '200', lifecycle: 'draft' },
  { label: 'draft: gas refill', amount: '90', lifecycle: 'draft' },
  { label: 'blocked: unknown receiver', amount: '350', lifecycle: 'rejected' },
];

function agentHash(i: number): string {
  return `00${i.toString(16).padStart(64, '0')}`;
}
function deployHash(i: number): string {
  return (i + 1).toString(16).padStart(64, '0');
}

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function get(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

async function main() {
  console.log(`seeding ${BASE} …\n`);
  const results: { label: string; id: string; want: Lifecycle; got: string; ok: boolean }[] = [];

  for (let i = 0; i < PLAN.length; i++) {
    const p = PLAN[i]!;
    const receiver = p.lifecycle === 'rejected' ? RECEIVER_BAD : RECEIVER_OK;
    const created = await post('/intents', {
      agent: agentHash(i),
      receiver,
      token: TOKEN,
      contract: CONTRACT,
      network: NETWORK,
      amount: p.amount,
    });
    if (created.status !== 201) {
      console.error(`  ✗ create failed (${created.status})`, created.json);
      continue;
    }
    const id: string = created.json.id;
    let got = 'DRAFT';

    if (p.lifecycle === 'validated' || p.lifecycle === 'executed' || p.lifecycle === 'rejected') {
      const vp = await post(`/intents/${id}/validate-policy`, {});
      got = vp.json?.state ?? (vp.status === 422 ? 'REJECTED' : `HTTP_${vp.status}`);
      if (p.lifecycle === 'rejected' && vp.status !== 422) {
        console.error(`  ! expected 422 denial, got ${vp.status}`, vp.json);
      }
    }
    if (p.lifecycle === 'executed') {
      const me = await post(`/intents/${id}/mark-executed`, { deployHash: deployHash(i) });
      got = me.json?.state ?? `HTTP_${me.status}`;
    }

    const wantState =
      p.lifecycle === 'draft'
        ? 'DRAFT'
        : p.lifecycle === 'validated'
          ? 'POLICY_VALIDATED'
          : p.lifecycle === 'executed'
            ? 'EXECUTED'
            : 'REJECTED';
    const ok = got === wantState;
    results.push({ label: p.label, id, want: p.lifecycle, got, ok });
    console.log(`  ${ok ? '✓' : '✗'} ${id}  ${got.padEnd(16)} ${p.amount.padStart(4)}  ${p.label}`);
  }

  // Reflect what the UI will read.
  const intents = await get('/intents');
  const byState: Record<string, number> = {};
  for (const it of intents.intents ?? intents) byState[it.state] = (byState[it.state] ?? 0) + 1;
  const vaults = await get('/vaults');
  const v = vaults.vaults?.[0];

  console.log('\nGET /intents by state:', byState);
  if (v) {
    const pct = (Number(v.usedTodayAtomic) / Number(v.perDayCapAtomic)) * 100;
    console.log(
      `GET /vaults  id=${v.id}  used=${v.usedTodayAtomic}/${v.perDayCapAtomic}  (${pct.toFixed(1)}%)`,
    );
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} intents reached target state.`,
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
