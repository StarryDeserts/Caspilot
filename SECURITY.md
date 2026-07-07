# Security Policy

Caspilot is a buildathon MVP that handles payment intent data and demonstrates a Casper Testnet PolicyVault. Please report security issues privately so we can fix them before public disclosure.

## Supported branch

| Branch | Supported |
|---|---|
| `main` | ✅ |

## Reporting a vulnerability

Please email the repository owner or open a private GitHub security advisory if available. Include:

- A concise description of the issue and affected component.
- Reproduction steps or a proof of concept.
- Impact assessment, especially whether funds, signing authority, private keys, or privileged API credentials could be exposed.
- Suggested remediation if known.

We will acknowledge receipt, triage severity, and prioritize fixes for High or Critical findings.

## Security invariants

- The API must not hold user wallet private keys.
- CSPR.cloud credentials and other privileged service keys must not be exposed to the browser bundle.
- Synthetic seeded demo hashes must not be represented as real on-chain proof.
- Real broadcasts are opt-in and must require explicit user or operator action.
