# Caspilot — Tier-1 On-Chain Demo (Real Proof)

Tier-1 is the buildathon's mandatory deliverable: prove that the delegated **PolicyVault** enforces policy on a real Casper network, not in a simulation. Caspilot does this end to end on **casper-test** — deploy the vault, fund it, let the agent make one **accepted** `pay()`, and watch the vault **reject** two payments that violate policy — and seals the finalized outcomes into a schema-valid artifact.

The proof below is **permanent and independently verifiable**. You do not need to re-run anything to inspect it: every deploy hash is finalized on casper-test and can be looked up on a block explorer.

## Verify on-chain (no rebuild required)

Real casper-test run, 2026-06-15, finalized across blocks **8185770–8185776**. Look any hash up on [`testnet.cspr.live`](https://testnet.cspr.live):

| Step | Result | Deploy hash | On-chain outcome |
|---|---|---|---|
| Deploy PolicyVault | ✅ installed | [`bf555d60…5431`](https://testnet.cspr.live/deploy/bf555d60bcbb3b9375d8281f32dceb86523fd0b5103ea11f409838ab3f2d5431) | package `ff2d4e13…7fb9` → contract `8f75ba25…d63e` |
| Deploy demo CEP-18 token | ✅ installed | recovered from the same deployer account | package `0f8b1bd8…e38a` → contract `89522729…1c9d` |
| `pay()` accepted | ✅ transfer | [`a7419aa2…2bdf5`](https://testnet.cspr.live/deploy/a7419aa2fcedff56b76fe509ecc745b9f1da0ecd5b26e0205a0241061242bdf5) | 50 tokens to the allowlisted receiver |
| `pay()` rejected — receiver not allowed | ⛔ reverted | [`e6801a75…cec7`](https://testnet.cspr.live/deploy/e6801a750b58bbe955240b0fef19e53ced76219be397043bb1f56e03280bcec7) | `User error: 3` (`ReceiverNotAllowed`) |
| `pay()` rejected — over per-payment max | ⛔ reverted | [`c4a48997…0eea`](https://testnet.cspr.live/deploy/c4a48997dfcd7c56c2d019caaa771467f71d48d50ca85584218fb2a9327a0eea) | `User error: 4` (`AmountAboveMax`) |

Vault package hash: `ff2d4e132f979f6d5c1af13d34270acfddc75a7c98c323be4d8b668140fb7fb9`.

Vault contract hash: [`8f75ba257f61ae1bbfa1f974a617705e519757445a77189d7c011327bdc5d63e`](https://testnet.cspr.live/contract/8f75ba257f61ae1bbfa1f974a617705e519757445a77189d7c011327bdc5d63e).

Demo CEP-18 package hash: `0f8b1bd871aa5061b278c1a45d653cb2f29a40f79e76196e35beb3851225e38a`.

Demo CEP-18 contract hash: `89522729a590b87af51d9d64831a03fb823bfd9dfb254feb0e446a2275601c9d`.

The two rejection codes are the **raw `PolicyVaultError` discriminants** from `contracts/policy-vault/src/errors.rs` (`NotOwner=1, AgentNotAllowed=2, ReceiverNotAllowed=3, AmountAboveMax=4, DayLimitExceeded=5, VaultExpired=6, NonceAlreadyUsed=7, InsufficientVaultBalance=8`). Odra surfaces a `self.revert(PolicyVaultError::X)` as `runtime::revert(ApiError::User(n))`, which the node records as `error_message: "User error: n"`.

## What the sequence proves

A genuine policy gate must do more than let a good payment through — it must **stop** bad ones on-chain, where the agent cannot override it. The four steps exercise both directions:

1. **Deploy + fund** — a fresh `PolicyVault` is installed with a per-payment max, a daily cap, an agent allowlist, a receiver allowlist, and a validity window, then funded with exactly the accepted amount.
2. **Accepted `pay()`** — the agent pays an allowlisted receiver within all limits; the vault performs the CEP-18 transfer. This is the happy path.
3. **Rejected — receiver not allowed** — the same agent pays a receiver that is *not* on the allowlist. The vault reverts with `ReceiverNotAllowed` (code 3) **before** moving any tokens.
4. **Rejected — over per-payment max** — a payment above the per-payment cap reverts with `AmountAboveMax` (code 4). (Check order is verified on-chain: a fresh vault is still inside its validity window, so this reverts at the amount check, not at `VaultExpired`.)

## Trust model

Caspilot's rule is **"AI proposes; signer/vault authorizes; chain executes."** The agent never holds a private key. In the harness write path:

- `loadLocalDevSigner` signs the **deploy hash** locally and hands back only a detached, tagged signature — `CasperDeployAdapter` re-validates a byte-identical deploy and broadcasts it. The key never crosses into the adapter.
- The vault's allowlisted agent is the signer's **own derived account hash** (`deriveAgentKey(signerPk)`), so the on-chain authority is bound to the key that actually signs — not to a value passed in by the caller.
- Even with a valid signature, every `pay()` is still subject to the vault's on-chain guards. The rejections above are the proof: a correctly-signed, correctly-formed payment is reverted purely because it violates policy.

## Reproduce it live (optional)

The sealed artifact is enough to demo — this section is only for regenerating it. **casper-test only, never mainnet. It spends real test-CSPR gas.**

The real run is opt-in (`RUN_REAL_ONCHAIN=1`) and executes through the gated vitest live runner. (It runs under vitest rather than a plain `tsx` script because casper-js-sdk ships a webpack-CJS bundle whose named value exports node's ESM lexer cannot load from a `tsx` entrypoint; vitest resolves the CJS interop.)

```bash
RUN_REAL_ONCHAIN=1 \
CASPER_NODE_RPC="http://<casper-test-node>:7777/rpc" \
CASPER_CHAINSPEC=casper-test \
LOCAL_SIGNER_PRIVATE_KEY_PATH="./Test Account 1_secret_key.pem" \
CASPER_SIGNER_ALGORITHM=secp256k1 \
VAULT_WASM_PATH=contracts/policy-vault/wasm/PolicyVault.wasm \
CEP18_WASM_PATH=contracts/policy-vault/wasm/Cep18.wasm \
CEP18_CONTRACT_HASH=<any-schema-valid-hash> \
DEMO_AGENT_HASH=<account-hash> \
DEMO_RECEIVER_HASH=<allowlisted-receiver-hash> \
DEMO_BLOCKED_RECEIVER_HASH=<non-allowlisted-receiver-hash> \
DEMO_MAX_SINGLE=100 \
DEMO_DAILY_LIMIT=1000 \
pnpm --filter harness test run-tier1.live
```

Required env: `RUN_REAL_ONCHAIN`, `CASPER_NODE_RPC`, `CASPER_CHAINSPEC`, `LOCAL_SIGNER_PRIVATE_KEY_PATH`, `VAULT_WASM_PATH`, `CEP18_WASM_PATH`, `CEP18_CONTRACT_HASH`, `DEMO_AGENT_HASH`, `DEMO_RECEIVER_HASH`, `DEMO_BLOCKED_RECEIVER_HASH`, `DEMO_MAX_SINGLE`, `DEMO_DAILY_LIMIT`.

Optional env (defaults): `CASPER_SIGNER_ALGORITHM` (`secp256k1`), `DEMO_PAY_AMOUNT` (`50`), `DEMO_REJECTION_AMOUNT` (`999`, must exceed `DEMO_MAX_SINGLE`), `DEMO_VAULT_VALID_UNTIL_MS` (now + 7 days), `CEP18_NAME`/`CEP18_SYMBOL`/`CEP18_DECIMALS`/`CEP18_TOTAL_SUPPLY` (`CaspilotDemoUSD`/`CDUSD`/`9`/`1000000000`), `CASPER_INSTALL_PAYMENT_MOTES` (`500000000000`), `CASPER_CALL_PAYMENT_MOTES` (`5000000000`).

Notes:
- `CEP18_CONTRACT_HASH` and `DEMO_AGENT_HASH` feed the offline dry-plan / SignerGuard seed only; the live run installs CEP-18 **fresh** and binds the agent to the signer's own derived account.
- Without `RUN_REAL_ONCHAIN=1`, nothing touches the network: the same file's offline integration tests drive the whole orchestrator through injected seams, and `pnpm --filter harness test` runs the full offline suite (the live test self-skips).

## The artifact

The run seals `apps/harness/.demo/tier1-artifacts.json` (validated by `TierOneArtifactsSchema`): network/chainspec, the vault `{contractHash, deployHash, finalizedHeight}`, the accepted `paySuccess {deployHash, amount, receiver, finalizedHeight}`, and the `rejections[] {kind, deployHash, errorCode, finalizedHeight}`.

`apps/harness/.demo/` is git-ignored, so the JSON file is **local-only** — re-run the live runner to regenerate it. The deploy hashes in this document are the durable proof: they are permanent on casper-test regardless of the local file.

## Appendix — casper-2.0 (Condor) testnet compat

Five SDK/node incompatibilities were found, fixed, and proven on-chain to make the live broadcast work (casper-js-sdk 5.0.12 against a casper-2.0 testnet node):

1. **JSON-RPC envelope** — the SDK serializes its request `version` field as `version`, but the node requires `jsonrpc`; the fetch handler rebuilds the body as `{jsonrpc, id, method, params}`.
2. **Reader named keys** — casper-2.0 returns a not-yet-migrated account under `Account` (the SDK's typed mapper expects `LegacyAccount`), so the reader parses named keys from the raw result.
3. **Legacy contract package** — Odra ModuleBytes installs produce a *legacy* `ContractPackage` under `hash-<pkg>` (not the 2.0 `Package` under `package-<pkg>`); the reader picks the max `contract_version`.
4. **Deploy finalization** — a legacy `account_put_deploy` is transaction-wrapped, so `info_get_deploy` never returns execution info; finalization is observed via `getTransactionByDeployHash`.
5. **CEP-18 init ABI** — odra-modules 2.0.0 `Cep18::init` is 7-arg `(symbol, name, decimals, initial_supply, admin_list, minter_list, modality)` with `modality = Option::None`.
