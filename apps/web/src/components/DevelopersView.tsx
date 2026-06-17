'use client';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DEV_SECTIONS } from '../lib/dev-sections.js';
import { useScrollSpy } from '../lib/use-scroll-spy.js';
import { CaspilotMark } from './CaspilotMark.js';
import { CopyButton } from './CopyButton.js';

// Stable identity for the scroll-spy effect dependency (must not be re-created
// each render, or the listener re-subscribes on every paint).
const SECTION_IDS = DEV_SECTIONS.map((s) => s.id);

// Full, pasteable example values. Docs that ship "00aa…" / "int_3hdp2en…"
// ellipses can't be copy-run; the code blocks below carry complete values and
// keep the ellipsis only for inline prose references.
const AGENT = '00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECEIVER = `00${'b'.repeat(AGENT.length - 2)}`;
const CONTRACT = `00${'c'.repeat(AGENT.length - 2)}`;
const INTENT_ID = 'int_3hdp2enbaqglke1jv7e1avk3d9';
const POLICY_DIGEST = 'bfc091a02d4e6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e2f4a6';

// Plain-text payloads the copy button writes to the clipboard — the pure JSON,
// without the request line, exactly what a caller would paste into a body.
const CREATE_REQ = `{
  "agent": "${AGENT}",
  "receiver": "${RECEIVER}",
  "token": "cspr-test-cep18",
  "contract": "${CONTRACT}",
  "network": "casper:casper-test",
  "amount": "500"
}`;
const CREATE_RES = `{
  "id": "${INTENT_ID}",
  "state": "DRAFT"
}`;
const VALIDATE_OK = `{
  "id": "${INTENT_ID}",
  "state": "POLICY_VALIDATED",
  "policyDigest": "${POLICY_DIGEST}"
}`;
const VALIDATE_ERR = `{
  "error": "policy_denied",
  "reason": "amount exceeds vault daily cap (1000 < 1500)",
  "state": "DRAFT"
}`;
const TRACE_RES = `{
  "id": "${INTENT_ID}",
  "entries": [
    {
      "atMs": 1739526062000,
      "state": "DRAFT",
      "kind": "created",
      "payload": { "body": { "token": "cspr-test-cep18", "amount": "500" } }
    },
    {
      "atMs": 1739526067000,
      "state": "POLICY_VALIDATED",
      "kind": "policy_check",
      "payload": { "allowed": true, "policyDigest": "${POLICY_DIGEST}" }
    }
  ]
}`;
const REJECT_RES = `{
  "id": "${INTENT_ID}",
  "state": "REJECTED"
}`;

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function RetryIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      <path d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7z" />
      <path d="M4 4l16 16" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// ── JSON tokens ────────────────────────────────────────────────────────────
// `Key`/`PlainStr` keep their quotes inside a single text node, so a bare
// getByText("value") never matches them. `Str` renders the value BARE inside an
// inner span with the quotes as siblings — RTL's getNodeText joins only direct
// text-node children, so the inner span's text equals the bare value (the docs
// promise: every shown value is selectable/pasteable on its own).
function Key({ children }: { children: string }) {
  return <span className="jk">{`"${children}"`}</span>;
}
function Str({ children }: { children: string }) {
  return (
    <span className="js">
      {'"'}
      <span className="jv">{children}</span>
      {'"'}
    </span>
  );
}
function PlainStr({ children }: { children: string }) {
  return <span className="js">{`"${children}"`}</span>;
}

function CodeBlock({
  label,
  tag,
  copy,
  children,
}: {
  label: ReactNode;
  tag?: string;
  copy: string;
  children: ReactNode;
}) {
  return (
    <div className="code">
      <div className="code-head">
        <span className="ch-label">{label}</span>
        <div className="ch-right">
          {tag ? <span className="ch-tag">{tag}</span> : null}
          <CopyButton text={copy} label="copy" />
        </div>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function Endpoint({
  method,
  path,
  title,
  desc,
  note,
  children,
}: {
  method: 'POST' | 'GET';
  path: string;
  title: string;
  desc: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  const verbClass = `verb ${method.toLowerCase()}`;
  return (
    <div className="ep">
      <div className="ep-left">
        <div className="ep-method">
          <span className={verbClass}>{method}</span>
        </div>
        <div className="ep-path">{path}</div>
        <h3>{title}</h3>
        <p>{desc}</p>
        {note ? <div className="note">{note}</div> : null}
      </div>
      {/* request line sits OUTSIDE the pre so copy yields pure JSON; the pair is
          bound by a dim-amber connector (.ep-pair::before), not bright amber. */}
      <div className="ep-right ep-pair">
        <div className="req-line">
          <span className={verbClass}>{method}</span>
          <span className="rl-path">{path}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function SectionBody({ id }: { id: string }) {
  switch (id) {
    case 'overview':
      return (
        <>
          <div className="kicker">OVERVIEW</div>
          <h2>A policy-gated intent API</h2>
          <p>
            Caspilot exposes a policy-gated intent API. Agents pay per call with <b>x402</b> (CEP-18
            + EIP-712 over casper-test). The agent never holds Caspilot&apos;s keys; Caspilot never
            broadcasts on the agent&apos;s behalf without policy approval.
          </p>
          <p>
            Every call moves an intent through an explicit finite-state machine. Nothing executes
            on-chain until a policy authorizes it, and every transition is recorded in a redacted
            trace.
          </p>
          <div className="url-chip">
            <span className="uc-dot" />
            https://api.caspilot.dev/v1<span className="uc-env">· casper-test</span>
          </div>
        </>
      );
    case 'auth':
      return (
        <>
          <div className="kicker">AUTHENTICATION</div>
          <h2>Pay-per-call, not API keys</h2>
          <p>
            There are no bearer tokens. Authorization is economic: each call is gated by an{' '}
            <b>x402</b> payment settled in CEP-18, with an EIP-712 receipt proving the transfer. The
            first request returns <code>402 Payment Required</code> with a quote; you pay, then
            retry with proof.
          </p>
          <p>
            Because authorization is a payment receipt rather than a stored secret,{' '}
            <b>there is no key to leak</b> — and Caspilot&apos;s signer is a separate service the
            API can never reach.
          </p>
        </>
      );
    case 'flow':
      return (
        <>
          <div className="kicker">THE x402 FLOW</div>
          <h2>Request → pay → retry → execute</h2>
          <p>
            Four steps, fully on the record. State colors below appear only in the small step badges
            and the node rings — never on the cards.
          </p>
          <div className="flow">
            <div className="flow-track" />
            <div className="flow-steps">
              <div className="fstep">
                <div className="fnode">01</div>
                <div className="fcard">
                  <span className="sbadge req">
                    <span className="sd" />
                    REQUEST
                  </span>
                  <div className="ftitle">Call the endpoint</div>
                  <div className="fdesc">Send the intent request with no payment yet.</div>
                </div>
              </div>
              <div className="fstep pay">
                <div className="fnode">02</div>
                <div className="fcard">
                  <span className="sbadge pay">
                    <span className="sd" />
                    402 QUOTE
                  </span>
                  <div className="ftitle">402 Payment Required</div>
                  <div className="fdesc">
                    Server returns a quote: amount, CEP-18 token, receiver.
                  </div>
                </div>
              </div>
              <div className="fstep proof">
                <div className="fnode">03</div>
                <div className="fcard">
                  <span className="sbadge proof">
                    <span className="sd" />
                    PAY · RECEIPT
                  </span>
                  <div className="ftitle">Pay + EIP-712 receipt</div>
                  <div className="fdesc">
                    CEP-18 transfer on casper-test; signed EIP-712 receipt as proof.
                  </div>
                </div>
              </div>
              <div className="fstep ok">
                <div className="fnode">04</div>
                <div className="fcard">
                  <span className="sbadge ok">
                    <span className="sd" />
                    200 OK
                  </span>
                  <div className="ftitle">Retry with proof</div>
                  <div className="fdesc">
                    Re-send the same call with the receipt; it succeeds and the intent advances.
                  </div>
                </div>
              </div>
            </div>
            <div className="retry-hint">
              <RetryIcon />
              Steps <b>01</b> and <b>04</b> are the <b>same endpoint</b> — the first call returns
              402, the retry carries the receipt.
            </div>
          </div>
        </>
      );
    case 'create':
      return (
        <>
          <div className="kicker">ENDPOINTS</div>
          <h2>Create intent</h2>
          <Endpoint
            method="POST"
            path="/intents"
            title="Draft a payment intent"
            desc={
              <>
                Creates an intent in <code>DRAFT</code>. Nothing executes — it is a proposal on the
                record, scoped to a vault and network.
              </>
            }
          >
            <CodeBlock label="Request body" tag="casper-test" copy={CREATE_REQ}>
              {'{\n  '}
              <Key>agent</Key>
              {': '}
              <Str>{AGENT}</Str>
              {',\n  '}
              <Key>receiver</Key>
              {': '}
              <Str>{RECEIVER}</Str>
              {',\n  '}
              <Key>token</Key>
              {': '}
              <Str>cspr-test-cep18</Str>
              {',\n  '}
              <Key>contract</Key>
              {': '}
              <Str>{CONTRACT}</Str>
              {',\n  '}
              <Key>network</Key>
              {': '}
              <PlainStr>casper:casper-test</PlainStr>
              {',\n  '}
              <Key>amount</Key>
              {': '}
              <Str>500</Str>
              {'\n}'}
            </CodeBlock>
            <CodeBlock label={<span className="status s2">201 Created</span>} copy={CREATE_RES}>
              {'{\n  '}
              <Key>id</Key>
              {': '}
              <Str>{INTENT_ID}</Str>
              {',\n  '}
              <Key>state</Key>
              {': '}
              <Str>DRAFT</Str>
              {'\n}'}
            </CodeBlock>
          </Endpoint>
        </>
      );
    case 'validate':
      return (
        <>
          <div className="kicker">ENDPOINTS</div>
          <h2>Validate policy</h2>
          <Endpoint
            method="POST"
            path="/intents/:id/validate-policy"
            title="Run the SignerGuard checks"
            desc={
              <>
                Checks caps and allowlist. On success the intent advances to{' '}
                <code>POLICY_VALIDATED</code> with a <code>policyDigest</code>. On denial it returns{' '}
                <code>422</code> with a human-readable reason.
              </>
            }
            note={
              <>
                Denials are explicit. The body always carries a <b>reason</b>, never a bare status
                code.
              </>
            }
          >
            <CodeBlock
              label={<span className="status s2">200 OK</span>}
              tag="casper-test"
              copy={VALIDATE_OK}
            >
              {'{\n  '}
              <Key>id</Key>
              {': '}
              <Str>{INTENT_ID}</Str>
              {',\n  '}
              <Key>state</Key>
              {': '}
              <Str>POLICY_VALIDATED</Str>
              {',\n  '}
              <Key>policyDigest</Key>
              {': '}
              <Str>{POLICY_DIGEST}</Str>
              {'\n}'}
            </CodeBlock>
            <CodeBlock
              label={<span className="status s4">422 Policy denied</span>}
              copy={VALIDATE_ERR}
            >
              {'{\n  '}
              <Key>error</Key>
              {': '}
              <Str>policy_denied</Str>
              {',\n  '}
              <Key>reason</Key>
              {': '}
              <Str>amount exceeds vault daily cap (1000 &lt; 1500)</Str>
              {',\n  '}
              <Key>state</Key>
              {': '}
              <Str>DRAFT</Str>
              {'\n}'}
            </CodeBlock>
          </Endpoint>
        </>
      );
    case 'trace':
      return (
        <>
          <div className="kicker">ENDPOINTS</div>
          <h2>Get trace</h2>
          <Endpoint
            method="GET"
            path="/intents/:id/trace"
            title="Read the audit trail"
            desc={<>Returns the ordered transitions for an intent — what happened and when.</>}
            note={
              <>
                Payloads are <b>redacted</b>. Agent reasoning never appears in the trace — by
                design.
              </>
            }
          >
            <CodeBlock
              label={<span className="status s2">200 OK</span>}
              tag="casper-test"
              copy={TRACE_RES}
            >
              {'{\n  '}
              <Key>id</Key>
              {': '}
              <Str>{INTENT_ID}</Str>
              {',\n  '}
              <Key>entries</Key>
              {': [\n    {\n      '}
              <Key>atMs</Key>
              {': '}
              <span className="jn">1739526062000</span>
              {',\n      '}
              <Key>state</Key>
              {': '}
              <Str>DRAFT</Str>
              {',\n      '}
              <Key>kind</Key>
              {': '}
              <Str>created</Str>
              {',\n      '}
              <Key>payload</Key>
              {': { '}
              <Key>body</Key>
              {': { '}
              <Key>token</Key>
              {': '}
              <Str>cspr-test-cep18</Str>
              {', '}
              <Key>amount</Key>
              {': '}
              <Str>500</Str>
              {' } }\n    },\n    {\n      '}
              <Key>atMs</Key>
              {': '}
              <span className="jn">1739526067000</span>
              {',\n      '}
              <Key>state</Key>
              {': '}
              <Str>POLICY_VALIDATED</Str>
              {',\n      '}
              <Key>kind</Key>
              {': '}
              <Str>policy_check</Str>
              {',\n      '}
              <Key>payload</Key>
              {': { '}
              <Key>allowed</Key>
              {': '}
              <span className="jb">true</span>
              {', '}
              <Key>policyDigest</Key>
              {': '}
              <Str>{POLICY_DIGEST}</Str>
              {' }\n    }\n  ]\n}'}
            </CodeBlock>
          </Endpoint>
        </>
      );
    case 'reject':
      return (
        <>
          <div className="kicker">ENDPOINTS</div>
          <h2>Reject intent</h2>
          <Endpoint
            method="POST"
            path="/intents/:id/reject"
            title="Terminate an intent"
            desc={
              <>
                Moves the intent to the terminal <code>REJECTED</code> state. Polling stops; the
                off-ramp is recorded on the trace.
              </>
            }
          >
            <CodeBlock
              label={<span className="status s2">200 OK</span>}
              tag="casper-test"
              copy={REJECT_RES}
            >
              {'{\n  '}
              <Key>id</Key>
              {': '}
              <Str>{INTENT_ID}</Str>
              {',\n  '}
              <Key>state</Key>
              {': '}
              <Str>REJECTED</Str>
              {'\n}'}
            </CodeBlock>
          </Endpoint>
        </>
      );
    case 'errors':
      return (
        <>
          <div className="kicker">ERRORS</div>
          <h2>Errors carry a reason</h2>
          <p>
            Every error body is human-readable. You get a status <i>and</i> a reason you can surface
            directly to a user or log — never a bare code.
          </p>
          <table className="err-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Meaning</th>
                <th>reason (body)</th>
                <th>Recover</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-l="Status">
                  <span className="estatus e402">
                    <span className="ed" />
                    402
                  </span>
                </td>
                <td data-l="Meaning" className="emeaning">
                  Payment Required
                </td>
                <td data-l="reason" className="ereason">
                  <span className="rk">reason:</span> &quot;quote: 500 cspr-test-cep18 to 00bb… —
                  pay and retry with receipt&quot;
                </td>
                <td data-l="Recover" className="erecover">
                  Pay the quote, then retry the same call with the EIP-712 receipt.
                </td>
              </tr>
              <tr>
                <td data-l="Status">
                  <span className="estatus e422">
                    <span className="ed" />
                    422
                  </span>
                </td>
                <td data-l="Meaning" className="emeaning">
                  Policy denied
                </td>
                <td data-l="reason" className="ereason">
                  <span className="rk">reason:</span> &quot;amount exceeds vault daily cap (1000
                  &lt; 1500)&quot;
                </td>
                <td data-l="Recover" className="erecover">
                  Lower the amount or use a vault with remaining cap.
                </td>
              </tr>
              <tr>
                <td data-l="Status">
                  <span className="estatus e404">
                    <span className="ed" />
                    404
                  </span>
                </td>
                <td data-l="Meaning" className="emeaning">
                  Unknown intent
                </td>
                <td data-l="reason" className="ereason">
                  <span className="rk">reason:</span> &quot;no intent with id int_3hdp2en… — it may
                  have been pruned&quot;
                </td>
                <td data-l="Recover" className="erecover">
                  Re-create the intent; pruned ids are not recoverable.
                </td>
              </tr>
              <tr>
                <td data-l="Status">
                  <span className="estatus e503">
                    <span className="ed" />
                    503
                  </span>
                </td>
                <td data-l="Meaning" className="emeaning">
                  Upstream unavailable
                </td>
                <td data-l="reason" className="ereason">
                  <span className="rk">reason:</span> &quot;getTrace 503 · node upstream
                  unavailable, retry shortly&quot;
                </td>
                <td data-l="Recover" className="erecover">
                  Transient — retry with backoff; the intent state is unchanged.
                </td>
              </tr>
            </tbody>
          </table>
          <div className="err-note">
            All errors share the shape <b>{'{ "error", "reason", "state"? }'}</b>. The <b>reason</b>{' '}
            is safe to display — it never contains keys, payloads, or agent reasoning.
          </div>
        </>
      );
    default:
      return null;
  }
}

export function DevelopersView() {
  const active = useScrollSpy(SECTION_IDS);

  return (
    <div className="developers">
      <header className="topbar">
        <div className="wordmark">
          <CaspilotMark size={18} />
          Caspilot
        </div>
        <div className="tb-right">
          <span className="tb-env">casper:casper-test</span>
          <Link className="btn btn-primary" href={'/console' as Route}>
            Launch console
            <ArrowIcon />
          </Link>
        </div>
      </header>

      <div className="docs">
        <nav className="anchor-nav" aria-label="API sections">
          <div className="ann-title">x402 API</div>
          {DEV_SECTIONS.map(({ id, label }) => (
            <a key={id} href={`#${id}`} className={active === id ? 'active' : undefined}>
              {label}
            </a>
          ))}
        </nav>

        <div className="content">
          {DEV_SECTIONS.map(({ id }) => (
            <section className="section" id={id} key={id}>
              <SectionBody id={id} />
            </section>
          ))}
        </div>
      </div>

      <section className="security">
        <div className="security-inner">
          <div className="kicker">SECURITY NOTE</div>
          <h2>What holds, structurally</h2>
          <div className="guarantees">
            <div className="grow">
              <ShieldIcon />
              <div>
                <div className="gt">Signer separation</div>
                <div className="gs">
                  The API never broadcasts. Signing is a separate service it cannot reach.
                </div>
              </div>
            </div>
            <div className="grow">
              <EyeOffIcon />
              <div>
                <div className="gt">Redacted trace</div>
                <div className="gs">
                  Transitions are recorded; reasoning never leaves the agent.
                </div>
              </div>
            </div>
            <div className="grow">
              <PulseIcon />
              <div>
                <div className="gt">Replay-protected payment ledger</div>
                <div className="gs">Reserve → commit. A receipt can be settled exactly once.</div>
              </div>
            </div>
            <div className="grow">
              <LockIcon />
              <div>
                <div className="gt">No secrets in client bundles</div>
                <div className="gs">
                  Bundle-checked — no keys or cloud credentials ship to the client.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="doc-footer-wrap">
        <div className="doc-footer">
          <div className="fbrand">
            <CaspilotMark size={18} />
            Caspilot
          </div>
          <div className="fmeta">casper:casper-test · API v1 · testnet only</div>
        </div>
      </footer>
    </div>
  );
}
