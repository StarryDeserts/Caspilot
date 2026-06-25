'use client';
import Link from 'next/link';
import type { Route } from 'next';
import type { HealthProbe } from '../lib/health.js';
import { useRevealRoot } from '../lib/use-reveal-root.js';
import { HeroTelemetry } from './HeroTelemetry.js';
import { StateBadge } from './StateBadge.js';
import { CaspilotMark } from './CaspilotMark.js';

// The one casper-test deploy we point judges at to "verify yourself": the
// accepted pay from the Phase 6 Tier-1 harness run, finalized on-chain. Kept as
// the genuine hash + its real explorer URL so the claim is auditable, not decor.
const PROOF_DEPLOY = 'a7419aa2fcedff56b76fe509ecc745b9f1da0ecd5b26e0205a0241061242bdf5';
const PROOF_URL = `https://testnet.cspr.live/deploy/${PROOF_DEPLOY}`;

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      <path d="M5 12l5 5 9-11" />
    </svg>
  );
}
function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

export interface LandingViewProps {
  probe?: () => Promise<HealthProbe>;
}

export function LandingView({ probe }: LandingViewProps) {
  const root = useRevealRoot<HTMLDivElement>();
  const telemetryProbe = probe ? { probe } : {};

  return (
    <div className="landing" ref={root}>
      {/* 1. HERO */}
      <section className="hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-glow" aria-hidden="true" />
        <HeroTelemetry network="casper-test" {...telemetryProbe} />
        <div className="wrap hero-inner">
          <span className="eyebrow" data-d="0">
            CASPER · casper-test
          </span>
          <h1 data-d="1">
            Autonomy you
            <br />
            can audit.
          </h1>
          <p className="sub" data-d="2">
            Caspilot is an autonomous DeFi-yield agent on Casper. The AI proposes, a policy and
            signer authorize, the chain executes — and every step is on the record.
          </p>
          <div className="hero-cta" data-d="3">
            <Link className="btn btn-primary btn-lg" href={'/console' as Route}>
              Launch console
              <ArrowIcon />
            </Link>
            <Link className="btn btn-secondary btn-lg" href={'/developers' as Route}>
              <BookIcon />
              Read the docs
            </Link>
          </div>
        </div>
        <div className="scroll-hint" data-d="4">
          ↓ the model
        </div>
      </section>

      {/* 2. THE MODEL */}
      <section className="section" id="model">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">THE MODEL</span>
            <h2>AI proposes · Policy authorizes · Chain executes</h2>
          </div>
          <div className="model-grid">
            <div className="mcard" data-reveal>
              <div className="mstep">01 · PROPOSE</div>
              <h3>Propose</h3>
              <p>
                The agent drafts a payment intent. Nothing moves yet — it is only a proposal on the
                record.
              </p>
              <div className="intent-chip">
                <span className="k">token</span>cspr-test-cep18
                <br />
                <span className="k">amount</span>500
                <br />
                <span className="k">network</span>casper:casper-test
              </div>
            </div>
            <div className="mcard" data-reveal>
              <div className="mstep">02 · AUTHORIZE</div>
              <h3>Authorize</h3>
              <p>
                A SignerGuard policy checks caps and allowlist before anything signs. The agent
                never holds keys.
              </p>
              <div className="intent-chip">
                <span className="k">policy</span>caps · allowlist
                <br />
                <span className="k">signer</span>detached
                <br />
                <span className="k">agent_keys</span>none
              </div>
            </div>
            <div className="mcard exec" data-reveal>
              <div className="mstep">03 · EXECUTE</div>
              <h3>Execute</h3>
              <p>
                A detached signature broadcasts to casper-test. The result is verifiable — a real
                deploy hash.
              </p>
              <div className="intent-chip">
                <span className="k">deploy</span>a741…bdf5
                <br />
                <span className="k">finality</span>finalized
                <br />
                <span className="k">proof</span>testnet.cspr.live
              </div>
            </div>
          </div>
          <div className="flow-badges" data-reveal>
            <StateBadge state="DRAFT" />
            <span className="arrow">→</span>
            <StateBadge state="POLICY_VALIDATED" />
            <span className="arrow">→</span>
            <StateBadge state="EXECUTED" />
          </div>
        </div>
      </section>

      {/* 3. TWO PRODUCT LINES */}
      <section className="section" id="products">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">TWO PRODUCT LINES</span>
            <h2>One model, two ways to delegate</h2>
          </div>
          <div className="lines-grid">
            <div className="lcard" data-reveal>
              <div className="ltag">// for agents</div>
              <h3>x402-paid agent API</h3>
              <p className="ldesc">
                Agents pay per call and move through a policy-gated intent lifecycle. Settlement is
                metered, every call is accountable.
              </p>
              <ul className="feat">
                <li>
                  <CheckIcon />
                  Pay-per-call with <span className="mono">CEP-18 + EIP-712</span>
                </li>
                <li>
                  <CheckIcon />
                  402 Payment Required → verify → submit
                </li>
                <li>
                  <CheckIcon />
                  Policy-gated intent FSM, fully traced
                </li>
              </ul>
              <Link className="learn" href={'/developers' as Route}>
                Learn more
                <ArrowIcon />
              </Link>
            </div>
            <div className="lcard" data-reveal>
              <div className="ltag">// for humans</div>
              <h3>Delegated PolicyVault</h3>
              <p className="ldesc">
                A human delegates scoped authority and signs with CSPR.click. The backend never sees
                the key — separation is structural.
              </p>
              <ul className="feat">
                <li>
                  <CheckIcon />
                  Scoped caps: max single + daily ceiling
                </li>
                <li>
                  <CheckIcon />
                  Sign in-browser with <span className="mono">CSPR.click</span>
                </li>
                <li>
                  <CheckIcon />
                  Backend never holds the private key
                </li>
              </ul>
              <Link className="learn" href={'/developers' as Route}>
                Learn more
                <ArrowIcon />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. SECURITY MODEL */}
      <section className="section security" id="security">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">SECURITY MODEL</span>
            <h2>Guarantees, not promises</h2>
            <p className="slead">
              Autonomy is only safe when the boundaries are structural. These four hold whether or
              not the agent behaves.
            </p>
          </div>
          <div className="guarantees">
            <div className="grow" data-reveal>
              <span className="gnum">01</span>
              <div className="gbody">
                <div className="gtitle">Signer separation</div>
                <div className="gsub">
                  The API never broadcasts. Proposing and signing are different services with
                  different trust.
                </div>
              </div>
            </div>
            <div className="grow" data-reveal>
              <span className="gnum">02</span>
              <div className="gbody">
                <div className="gtitle">Redacted audit trace</div>
                <div className="gsub">
                  Reasoning never leaves the agent. The trace records what happened, not the
                  chain-of-thought.
                </div>
              </div>
            </div>
            <div className="grow" data-reveal>
              <span className="gnum">03</span>
              <div className="gbody">
                <div className="gtitle">No secrets in the browser</div>
                <div className="gsub">
                  Bundle-checked — no private keys, no seed material ever ships to the client.
                </div>
              </div>
            </div>
            <div className="grow" data-reveal>
              <span className="gnum">04</span>
              <div className="gbody">
                <div className="gtitle">Real on-chain proof</div>
                <div className="gsub">
                  Every demo ends in a casper-test deploy hash you can verify yourself.
                </div>
                <div className="hashline">
                  <span className="hlabel">deploy</span>
                  <span className="hx">{PROOF_DEPLOY}</span>
                  <a href={PROOF_URL} target="_blank" rel="noreferrer">
                    testnet.cspr.live
                    <ExternalIcon />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. PROOF STRIP */}
      <section className="proof-strip">
        <div className="wrap">
          <div className="proof-chips">
            <span className="pchip" data-reveal>
              <span className="pn">12</span>
              <span className="pl">FSM states</span>
            </span>
            <span className="pchip" data-reveal>
              <span className="ok" />
              <span className="pl">casper-test verified</span>
            </span>
            <span className="pchip" data-reveal>
              <span className="pn">0</span>
              <span className="pl">keys in API</span>
            </span>
            <span className="pchip" data-reveal>
              <span className="pn">305+</span>
              <span className="pl">tests</span>
            </span>
          </div>
        </div>
      </section>

      {/* 6. FOOTER CTA */}
      <section className="footer-cta">
        <div className="fglow" aria-hidden="true" />
        <div className="wrap">
          <h2 data-reveal>Mission-control for autonomous capital.</h2>
          <p data-reveal>Propose, authorize, execute — on the record, on casper-test.</p>
          <div className="fcta" data-reveal>
            <Link className="btn btn-primary btn-lg" href={'/console' as Route}>
              Launch console
              <ArrowIcon />
            </Link>
            <Link className="btn btn-secondary btn-lg" href={'/developers' as Route}>
              <BookIcon />
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap footer-inner">
          <div className="fbrand">
            <CaspilotMark size={18} />
            Caspilot
          </div>
          <div className="fmeta">casper:casper-test · testnet only</div>
          <div className="flinks">
            <Link href={'/developers' as Route}>Docs</Link>
            <Link href={'/console' as Route}>Console</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
