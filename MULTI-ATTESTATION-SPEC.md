# Multi-Attestation Payload Format

**Version:** 1.1
**Status:** Draft
**Date:** 2026-04-10
**Discussion:** [insumer-examples#1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1)
**Blog posts:** [Multi-Issuer Verification](https://insumermodel.com/blog/multi-attestation-four-issuers-one-verification-pass.html) · [Would You Trust Your Agent? KYA Is Real.](https://insumermodel.com/blog/multi-attestation-spec-five-shipped-wallet-binding.html)

---

## Abstract

The Multi-Attestation Payload Format defines a composable envelope for bundling independently signed attestations from multiple issuers into a single verifiable object. Each attestation is self-describing — it carries its own algorithm, key identifier, and JWKS discovery endpoint. No shared registry or coordination between issuers is required. A relying party selects attestations by `type`, fetches each issuer's public key via standard JWKS, and verifies signatures independently.

This format emerged from convergence across nine independent issuers contributing ten signed dimensions: InsumerAPI (wallet state — the foundation layer, 33 chains), Revettr (compliance risk), ThoughtProof (reasoning integrity), RNWY (two dimensions — agent-level behavioral trust AND operator-level wallet intelligence), Maiat (job performance), APS (passport grade), AgentID (trust verification), AgentGraph (security posture), and SAR (settlement witness). Each issuer publishes a JWKS endpoint and signs attestations using either ES256 or EdDSA. The payload format is algorithm-agnostic and supports both raw signatures (base64-encoded P1363) and compact JWS (JWT).

---

## 1. Payload Format

```json
{
  "v": 1,
  "attestations": [
    {
      "issuer": "https://api.insumermodel.com",
      "type": "wallet_state",
      "kid": "insumer-attest-v1",
      "alg": "ES256",
      "jwks": "https://insumermodel.com/.well-known/jwks.json",
      "signed": { },
      "sig": "<base64 | compact-jws>",
      "expiry": "2026-03-20T13:04:57.000Z"
    }
  ],
  "expired": []
}
```

### Root Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `v` | integer | MUST | Format version. Currently `1`. |
| `attestations` | array | MUST | Active, unexpired attestation entries. |
| `expired` | array | SHOULD | Attestation entries past their TTL. Separated from `attestations` so relying parties can distinguish stale data without re-checking expiry. |

### Attestation Entry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `issuer` | string (URI) | MUST | Canonical issuer identifier. |
| `type` | string | MUST | Attestation type (see Section 2). Relying parties select entries by this field, not by position. |
| `kid` | string | MUST | Key ID for JWKS lookup. |
| `alg` | string | MUST | Signing algorithm. One of `ES256`, `EdDSA`. |
| `jwks` | string (URL) | MUST | JWKS endpoint where the public key for `kid` can be fetched. |
| `signed` | object \| null | CONDITIONAL | The signed payload object. MUST be present when `sig` is a raw signature. MAY be `null` when `sig` is a compact JWS (the payload is embedded in the JWT). |
| `sig` | string | MUST | Either a base64-encoded raw signature (P1363 format for ES256, raw bytes for EdDSA) or a compact JWS string (three dot-separated base64url segments). |
| `expiry` | string (ISO 8601) | SHOULD | Expiration timestamp. If absent, relying parties SHOULD apply a default TTL of 30 minutes from `attestedAt` / `iat` / `timestamp` in the signed payload. |

### Design Decisions

- **Insertion order is not significant.** Relying parties select attestations by `type`, never by array index.
- **`requiredTypes` belongs in verifier configuration, not in the payload.** The payload is a neutral bundle; policy is the relying party's concern.
- **Only verifiable entries appear in `attestations`.** Unsigned or unverifiable data MUST NOT be included.
- **Self-describing entries.** Each attestation carries its own `alg`, `kid`, and `jwks`. No shared key registry, no trust anchors beyond JWKS.
- **Signature format is polymorphic.** If `sig` contains exactly two dots, it is a compact JWS. Otherwise, it is a base64-encoded raw signature over `JSON.stringify(signed)`.

### Reference Implementation Criteria

The issuer table in Section 2 is this spec's reference set. Participation in the discussion thread ([insumer-examples#1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1)) is open and is not by itself a reference — entries are added to the table only after meeting the criteria below.

To be added to the reference set, an implementation MUST:

1. **Publish a JWKS endpoint** at a stable URL, returning a JWK set containing the `kid` referenced in the attestation entry.
2. **Sign attestations end-to-end.** The `sig` field MUST verify against the public key fetched from the JWKS endpoint, over the canonical bytes of the signed payload — `JSON.stringify(signed)` for ES256 raw P1363, `header.payload` for compact JWS, or either insertion-order or sorted-key JSON for EdDSA raw (the reference verifier accepts both).
3. **Be reproducible by a third-party verifier.** The reference verifier (`multi-attest-verify.js`) MUST resolve the JWKS, fetch a live attestation, and return a verified result with no issuer cooperation beyond the published endpoints.

When all three conditions hold against a live attestation, the implementation is added to the Section 2 table as a live issuer.

Schema reservations, aspirational commitments, or proposed attestation dimensions that have not shipped a live JWKS and a verifiable attestation are not in the reference set. They may be tracked elsewhere as future work.

---

## 2. Attestation Types

| Type | Issuer | Algorithm | Signature Format | Default TTL |
|------|--------|-----------|------------------|-------------|
| `wallet_state` | InsumerAPI | ES256 | base64 P1363 (or JWT when `format: "jwt"` requested) | 30 min |
| `compliance_risk` | Revettr | ES256 | compact JWS (JWT) | 1 hour |
| `reasoning_integrity` | ThoughtProof | EdDSA (Ed25519) | compact JWS (JWT) | per-issuer |
| `behavioral_trust` | RNWY | ES256 | base64 P1363 (kid `rnwy-trust-v2`, legacy `rnwy-trust-v1`) | 24 hours |
| `wallet_intelligence` | RNWY | ES256 | compact JWS (JWT, kid `rnwy-wallet-v1`) | 24 hours |
| `job_performance` | Maiat | ES256 | compact JWS (JWT) | 30 min |
| `passport_grade` | APS | EdDSA (Ed25519) | compact JWS (JWT) | per-issuer |
| `trust_verification` | AgentID | EdDSA (Ed25519) | compact JWS (JWT) | 1 hour |
| `security_posture` | AgentGraph | EdDSA (Ed25519) | compact JWS (JWT) | 24 hours |
| `settlement_witness` | SAR | EdDSA (Ed25519) | compact JWS (JWT, kid `sar-prod-ed25519-03` current, `-02`/`-01` legacy) | per-issuer |

---

## 2.5 Two Categories of Wallet Binding

An analytical split across the envelope worth naming because it clarifies how composition policies should weight signals. Both categories are cryptographically verifiable and both fit the envelope. They answer different questions, and neither is weaker than the other.

**Wallet-bound identity dimensions.** The signed JWS payload contains the wallet itself. A verifier holding only the signed bytes can prove "this specific wallet → this signal." The binding is cryptographic end-to-end.

| Dimension | Provider | Signed field |
|---|---|---|
| Wallet state (foundation, 33 chains) | InsumerAPI | `wallet` (EVM via `/v1/trust`) / JWT `sub` (non-EVM via `/v1/attest`) |
| Behavioral trust (agent) | RNWY v2 | `owner` |
| Wallet intelligence (operator) | RNWY `rnwy-wallet-v1` | `sub`, `wallet` |
| Job performance | Maiat | `sub`, `agent` |
| Compliance risk | Revettr | `sub` |
| Identity verification | AgentID v1.1.0 | `bound_addresses`, `solana_address`, `wallet_address` |
| Passport grade (governance) | APS `gateway-v1` | `wallet_ref[].address` (envelope JWS, gateway key) + `wallet_ref[].binding_sig` (per-entry, passport pubkey) |
| Settlement witness (new receipts) | SAR `sar-prod-ed25519-03` | `counterparty` |

**APS has a two-layer binding model worth naming.** The `wallet_ref[]` array is inside the envelope-level Ed25519 JWS signed by the `gateway-v1` key, which proves "the APS gateway attested that this agent has these bound wallets at the named `bound_at` timestamps." Each entry additionally carries a per-wallet `binding_sig` — a separate Ed25519 signature over the canonical binding payload `{passport_id, chain, address, bound_at}` (via the reference `canonicalize()` algorithm), signed by the passport's own private key. The per-wallet signature verifies against the passport pubkey (published in a fixture for the canonical `aeoess-bound-demo` test passport, and in the passport object itself for production passports). Both layers verify offline and compose: the gateway layer says "our infrastructure observed this binding," and the passport layer says "the passport holder cryptographically claimed this binding themselves." Consumers can require either or both layers depending on their trust model.

**Wallet-discoverable content dimensions.** The signed JWS payload commits to what is being attested about (a repo, a task outcome, a delivery record). The wallet is a lookup key that discovers the relevant signed subject. A verifier holding only the signed bytes can prove "this repo scored 100" or "this task outcome matched spec" — but not "this wallet owns this repo." This is not a limitation; it is the correct architectural shape for dimensions that attest to things rather than identities.

| Dimension | Provider | Signed subject |
|---|---|---|
| Security posture | AgentGraph | `github:owner/repo` |

As of the 2026-04-10 SAR kid rotation to `sar-prod-ed25519-03`, the `counterparty` field is now inside signed bytes for new receipts, moving `settlement_witness` into the wallet-bound category for post-upgrade receipts. Legacy receipts signed under kid `-02` or `-01` remain wallet-discoverable via the `/settlement-witness/receipts?wallet={address}` transport lookup.

**Not wallet-binding by design.** ThoughtProof commits to a `claim_hash` (SHA-256 of a natural-language reasoning claim). The wallet does not appear in the signed bytes. That is consistent with its attestation surface — it attests to the soundness of a reasoning chain, which is a property of the action, not the actor.

---

## 3. Per-Issuer Schemas

### 3.1 InsumerAPI — `wallet_state` (foundation layer)

**InsumerAPI is the foundation layer.** It reads wallet state across 33 chains (30 EVM + Solana + XRPL + Bitcoin) and establishes the chain context every other dimension composes on top of. The other nine dimensions answer specialized questions; the foundation answers "what does this wallet actually hold and do on-chain."

Privacy-preserving on-chain verification. Returns signed booleans. No balances exposed.

**Endpoint routing by wallet format:**

- **EVM wallets** → `POST /v1/trust` — curated multi-chain trust profile. Returns an ECDSA-signed fact profile across stablecoins, governance tokens, NFTs, and staking positions. An EVM wallet is the mandatory anchor for this endpoint.
- **Non-EVM wallets (Solana, XRPL, Bitcoin)** → `POST /v1/attest` with `format: "jwt"` and chain-appropriate conditions. The wallet lands in the signed JWT `sub` claim, making the binding cryptographic even for non-EVM formats.

| Property | Value |
|----------|-------|
| Issuer URI | `https://api.insumermodel.com` |
| Algorithm | ES256 (ECDSA P-256) |
| Key ID | `insumer-attest-v1` |
| JWKS | `https://insumermodel.com/.well-known/jwks.json` |
| Also | `GET /v1/jwks` (API endpoint, 24h cache) |

**Getting started:** Free API key, no credit card. Returns the key immediately.

```bash
curl -X POST https://api.insumermodel.com/v1/keys/create \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","appName":"my-app","tier":"free"}'
```

Docs: [insumermodel.com/developers](https://insumermodel.com/developers/)

**Signed payload fields** (these fields are included in `JSON.stringify(signed)` and covered by the signature):

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique attestation identifier (e.g., `ATST-BCB27849413440C7`). |
| `pass` | boolean | Aggregate result — `true` if all conditions met. |
| `results` | array | Per-condition results. |
| `results[].condition` | number | Zero-based condition index. |
| `results[].label` | string | Caller-supplied label. |
| `results[].type` | string | Condition type (e.g., `token_balance`, `nft_ownership`). |
| `results[].chainId` | number \| string | Chain ID where the condition was evaluated. |
| `results[].met` | boolean | Whether this individual condition was satisfied. |
| `results[].evaluatedCondition` | object | The evaluated condition parameters (type, chainId, contractAddress, operator, threshold, etc.). |
| `results[].conditionHash` | string | `0x`-prefixed SHA-256 hash of the canonical (sorted-key) evaluated condition JSON. |
| `results[].blockNumber` | number | Block number at evaluation time (when available). |
| `results[].blockTimestamp` | string | Block timestamp (when available). |
| `attestedAt` | string | ISO 8601 timestamp of attestation creation. |

**Not signed** (present in the API response but NOT covered by the signature):

| Field | Type | Description |
|-------|------|-------------|
| `passCount` | number | Number of conditions that passed. |
| `failCount` | number | Number of conditions that failed. |
| `expiresAt` | string | ISO 8601 expiration timestamp (30 minutes from `attestedAt`). |

**Signature:** Base64-encoded P1363 (`r || s`, 64 bytes) over `JSON.stringify(signed)`, where `signed` = `{ id, pass, results, attestedAt }`.

**Optional JWT format:** When requested with `format: "jwt"`, the API also returns an ES256 JWT with claims: `iss`, `sub` (wallet address), `jti` (attestation ID), `iat`, `exp` (+1800s), `pass`, `conditionHash[]`, `blockNumber`, `blockTimestamp`, `results[]`.


### 3.2 ThoughtProof — `reasoning_integrity`

AI reasoning verification. Attests to the integrity and diversity of model reasoning behind a claim.

| Property | Value |
|----------|-------|
| Issuer URI | `https://api.thoughtproof.ai` |
| Algorithm | EdDSA (Ed25519) |
| Key ID | `tp-attestor-v1` |
| JWKS | `https://api.thoughtproof.ai/.well-known/jwks.json` |
| SDK | `thoughtproof-sdk` on npm (v0.2.1) |

**Getting started:** Free operator key, or pay per-call via x402 (USDC on Base) with no key.

```bash
curl -X POST https://api.thoughtproof.ai/v1/operators \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent","email":"you@example.com"}'
```

Docs: [thoughtproof.ai/api](https://thoughtproof.ai/api)

**Signed payload fields (JWT claims):**

| Field | Type | Description |
|-------|------|-------------|
| `verdict` | string | One of `ALLOW`, `HOLD`, `UNCERTAIN`, `DISSENT`. |
| `confidence` | number | Confidence score. |
| `mdi` | number | Model Diversity Index — measures reasoning diversity. |
| `claimHash` | string | `sha256:...` hash of the original claim. |
| `domain` | string | Domain of the claim (e.g., `financial`). |
| `stakeLevel` | string | Stake level of the verification. |
| `timestamp` | string | ISO 8601 timestamp. |

**Signature:** Compact JWS (JWT) with EdDSA (Ed25519).


### 3.3 RNWY — `behavioral_trust`

On-chain behavioral trust scoring with sybil detection across ERC-8004, Olas, Virtuals, and SATI (Solana) agent registries. Dual-score architecture: Signal Depth (behavioral observability) and Risk Intensity (sybil/fraud risk) are independent axes — collapsing them into a single number loses information. Keyless (no API key required).

| Property | Value |
|----------|-------|
| Issuer URI | `https://rnwy.com` |
| Algorithm | ES256 (ECDSA P-256) |
| Key ID | `rnwy-trust-v2` (current, shipped 2026-04-10) · `rnwy-trust-v1` (legacy, compat window) |
| JWKS | `https://rnwy.com/.well-known/jwks.json` |
| On-chain oracle | [`0xD5fdccD492bB5568bC7aeB1f1E888e0BbA6276f4`](https://basescan.org/address/0xD5fdccD492bB5568bC7aeB1f1E888e0BbA6276f4) (Base, 150K+ agents) |
| SDK | `rnwy-sdk` on npm |
| Default TTL | 24 hours (nightly pipeline refresh at 3 AM UTC) |

**Getting started:** No API key required. Install the SDK and start querying.

```bash
npm install rnwy-sdk
```

Docs: [rnwy.com/api](https://rnwy.com/api)

**Coverage:** 150,000+ agents indexed across ERC-8004, Olas, Virtuals, and SATI (Solana). 121,000+ wallets scored. 12 EVM chains + Solana. 1.7M+ on-chain commerce jobs indexed.

**Signed payload fields:**

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | number | Agent identifier. |
| `chain` | string | Chain where the behavior was evaluated (e.g., `base`). |
| `registry` | string | Registry identifier (`erc8004`, `olas`, `sati`). |
| `score` | number | Trust score (0–95). Capped at 95; no agent achieves perfect observability. |
| `tier` | string | Trust tier: `flagged`, `limited`, `developing`, `established`. |
| `badges` | array | Earned badges and warnings (e.g., `original_owner`, `low_history_reviewers`, `sybil_heavy`). |
| `sybilSeverity` | string | Sybil risk severity: `none`, `low`, `moderate`, or `heavy`. |
| `sybilSignals` | array | Specific sybil indicators: `sweep_pattern`, `inhuman_velocity`, `score_clustering`, `coordination`, `common_funder`. |
| `attestedAt` | string | ISO 8601 attestation timestamp. |

**Signature:** Base64-encoded P1363 (`r || s`, 64 bytes) over `JSON.stringify(signed)`.

#### 3.3.0 `rnwy-trust-v2` — upgraded signed payload (current)

As of 2026-04-10, RNWY ships `rnwy-trust-v2` with an expanded signed payload putting the wallet directly in signature scope — cryptographic wallet→score binding end-to-end.

**Signed block (`rnwy-trust-v2`):** `agentId`, `chain`, `registry`, `owner`, `score`, `tier`, `badges`, `sybilSeverity`, `sybilSignals`, `issuedAt`, `verifiedAt`, `expiry`.

- `owner` is the wallet address — this is the wallet-bound field that moves RNWY from wallet-discoverable to wallet-bound in the taxonomy above.
- Chain auto-resolves from the highest-scoring agent owned by the wallet — no `?chain=` parameter required for a wallet lookup.
- Unknown wallets return a **signed `found: false` envelope**: `{ found: false, wallet, issuedAt }` with a full ES256 signature. Cryptographic proof of absence rather than unsigned JSON. Consumers that want to deny-list on "no positive signal" can rely on a verifiable negative claim.

**Wallet-based lookup:** call the trust-check endpoint with a wallet address — RNWY resolves to the highest-scoring owned agent and returns the signed `rnwy-trust-v2` envelope. No chain parameter required.

#### 3.3.1 Evidence Extension (proposed)

The following evidence fields are served by the explorer API and are not yet covered by the signed payload. The proposal is to incorporate them into the signed object in a future update, making the evidence verifiable end-to-end.

**Dual scores (independent axes, not one number):**

| Score | Range | Zones | Description |
|-------|-------|-------|-------------|
| `signal_depth` | 0–95 | Minimal / Emerging / Established / Deep | Behavioral observability: on-chain activity, commerce history, review patterns, wallet tenure. Capped at 95 — no agent achieves perfect observability. |
| `risk_intensity` | 0–100 | Clean / Low / Elevated / Severe | Sybil and fraud risk: wallet funding patterns, review velocity, sweep detection, score clustering. |

**Evidence fields:**

| Field | Type | Description |
|-------|------|-------------|
| `wallet_age_days` | number | Wallet age in days. |
| `wallet_age_score` | number | Wallet age score (0–100). |
| `agent_registered_days` | number | Days since agent registration. |
| `is_original_owner` | boolean | Whether the registering wallet still owns the agent. |
| `transfer_count` | number | Number of ownership transfers. |
| `total_feedback` | number | Total reviews received. |
| `reviewer_diversity_ratio` | number | Ratio of unique reviewers to total reviews. |
| `reviewer_burst_pct` | number | Percentage of reviews in the densest 24-hour window. |
| `reviewer_spread_score` | number | Temporal distribution across review period (0 = all clustered). |
| `sybil_flags` | number | Number of independent sybil signals firing. |
| `sybil_severity` | string | Sybil risk severity level. |
| `sybil_weighted_score` | number | Weighted sybil composite score. |
| `sybil_signals` | array | Active sybil indicators (see signed payload). |
| `reviewer_credibility.pct_low_history` | number | Percentage of reviewers with low-history wallets. |
| `reviewer_credibility.dominant_age_bucket` | string | Most common reviewer wallet age bucket. |
| `reviewer_credibility.label` | string | Credibility label (`Not Credible`, `Low`, `Moderate`, `High`). |
| `transaction_backed_review_pct` | number | Percentage of reviews tied to verifiable on-chain commerce. |
| `commerce_jobs_completed` | number | Verifiable on-chain commerce jobs. |
| `commerce_circularity_pct` | number | Self-dealing detection — fraction of commerce looping back to owner. |
| `registration_quality_score` | number | Metadata completeness and connectivity score. |

**Sybil detection signals (first-class, not bolted on):**

| Signal | Description |
|--------|-------------|
| `common_funder` | Multiple reviewer wallets funded by the same source. |
| `inhuman_velocity` | Review submission rate exceeding human capability. |
| `sweep_pattern` | Reviewers spread across hundreds of agents without returning. |
| `score_clustering` | Reviewers consistently assigning identical scores. |
| `coordination` | Agent-level modifier detecting coordinated reviewer behavior. |

**Reference case:** Agent [Base #1380](https://rnwy.com/explorer/base/1380) — 1,520 reviews, score of zero. 99.7% of reviewers have wallets created the same day they reviewed, four sybil signals firing, 0% of reviews tied to on-chain commerce. A star-counting system would rank it highly.


**Live endpoints:**

| Endpoint | URL |
|----------|-----|
| Trust check (signed) | `GET https://rnwy.com/api/trust-check?chain=base&id={agentId}` |
| Explorer (full evidence) | `GET https://rnwy.com/api/explorer?id={agentId}&chain=base` |
| Explorer (web) | `https://rnwy.com/explorer/{chain}/{agentId}` |
| JWKS | `https://rnwy.com/.well-known/jwks.json` |
| On-chain oracle | [`0xD5fd...e4` on Base](https://basescan.org/address/0xD5fdccD492bB5568bC7aeB1f1E888e0BbA6276f4) |


### 3.4 Maiat — `job_performance`

Agent job performance scoring. Keyless (no API key required, rate-limited to 10 req/min).

| Property | Value |
|----------|-------|
| Issuer URI | `https://app.maiat.io` |
| Algorithm | ES256 (ECDSA P-256) |
| Key ID | `maiat-trust-v1` |
| JWKS | `https://app.maiat.io/.well-known/jwks.json` |
| Default TTL | 30 minutes |

**Getting started:** No API key required. Call the API directly or install the SDK.

```bash
npm install @jhinresh/maiat-sdk
```

Docs: [github.com/JhiNResH/maiat-protocol](https://github.com/JhiNResH/maiat-protocol)

**Signed payload fields (JWT claims):**

| Field | Type | Description |
|-------|------|-------------|
| `agent` | string | Agent identifier. |
| `score` | number | Job performance score. |
| `completionRate` | number | Job completion rate. |
| `sybilFlags` | array | Sybil indicators. |
| `jobCount` | number | Total jobs completed. |
| `tier` | string | Performance tier. |
| `attestedAt` | string | ISO 8601 attestation timestamp. |

**Signature:** Compact JWS (JWT) with ES256.


### 3.5 APS (Agent Passport System) — `passport_grade`

Agent identity verification with graded passports. Measures how deeply an agent's identity has been verified, and cryptographically binds the passport to one or more wallet addresses via a per-wallet signature architecture.

| Property | Value |
|----------|-------|
| Issuer URI | `https://gateway.aeoess.com` |
| Algorithm | EdDSA (Ed25519) |
| Key ID | `gateway-v1` |
| JWKS | `https://gateway.aeoess.com/.well-known/jwks.json` |
| SDK | `agent-passport-system` — [github.com/aeoess/agent-passport-system](https://github.com/aeoess/agent-passport-system) |
| Reference verifier | [`verifyBoundWallet()` in `src/v2/wallet-binding/bind.ts`](https://github.com/aeoess/agent-passport-system/blob/main/src/v2/wallet-binding/bind.ts) |

**Getting started:** No API key required. Three endpoints cover agent-first, wallet-first, and attestation retrieval flows.

```bash
# Agent-first lookup — agent_id → envelope (warm step required before /attestation)
curl https://gateway.aeoess.com/api/v1/public/trust/{agent_id}
curl https://gateway.aeoess.com/api/v1/public/trust/{agent_id}/attestation

# Wallet-first reverse index — address → envelope with wallet_ref[] populated
curl https://gateway.aeoess.com/api/v1/public/trust/by-wallet/{address}
```

The reverse index endpoint was shipped 2026-04-10 and enables SkyeProfile-style orchestrators to start from a wallet address, resolve the bound passport, and fetch the signed attestation without needing to know the `agent_id` in advance. It returns `found: false` with a `reason` field for unbound wallets. The attestation endpoint is cache-backed by `agent_id`; a warm GET on `/trust/{agent_id}` is required before `/trust/{agent_id}/attestation` returns a signed JWS (cold requests return 404).

Docs: [github.com/aeoess/agent-passport-system](https://github.com/aeoess/agent-passport-system)

**Signed payload fields (envelope, Ed25519 JWS signed by `gateway-v1`):**

| Field | Type | Description |
|-------|------|-------------|
| `agent_id` | string | Passport identifier (e.g., `aeoess-bound-demo`). |
| `grade` | number | Passport grade (0-3). |
| `grade_label` | string | Human-readable grade label. |
| `risk_level` | string | Risk assessment level. |
| `context_continuity` | object | Context continuity metrics. |
| `has_delegation` | boolean | Whether the agent has active delegation. |
| `has_wallet` | boolean | Legacy envelope-level flag indicating any wallet is registered. |
| `wallet_ref` | array | Bound wallets, each with `{chain, address, bound_at, binding_sig}`. Inside envelope signature scope. |
| `matched_wallet` | object | The specific `wallet_ref[]` entry that matched the query, when the lookup was wallet-first. |
| `evaluatedAt` | string | ISO 8601 evaluation timestamp. |

**Signature:** Compact JWS (JWT) with EdDSA (Ed25519), signed by the `gateway-v1` key.

**Per-wallet binding signatures (`wallet_ref[].binding_sig`) — the strict layer.**

Each entry in `wallet_ref[]` carries its own `binding_sig`, a raw Ed25519 signature independent of the envelope JWS. The signature is over the canonical payload:

```
canonicalize({
  passport_id: <string>,
  chain: <string>,        // e.g. "ethereum", "base"
  address: <string>,      // wallet address, case-preserving
  bound_at: <string>      // ISO 8601 with millisecond precision
})
```

where `canonicalize()` is the reference algorithm in [`src/core/canonical.ts`](https://github.com/aeoess/agent-passport-system/blob/main/src/core/canonical.ts) — sort keys alphabetically, strip null/undefined, compact JSON (no whitespace). The `binding_sig` is signed by the **passport's own private key**, not the gateway key. This gives the wallet binding two independent cryptographic layers:

1. **Envelope layer** (`gateway-v1` JWS) — proves "the APS gateway's infrastructure observed and attested this binding at the named timestamp." Verifiable against `https://gateway.aeoess.com/.well-known/jwks.json`.
2. **Per-wallet layer** (`binding_sig` against passport pubkey) — proves "the passport holder themselves cryptographically committed to this binding." Verifiable against the passport's public key, which lives in the passport object itself for production passports, and in a published fixture file for the canonical `aeoess-bound-demo` test passport.

Both layers verify offline. A consumer wanting the strongest possible "this wallet is bound to this passport" guarantee can require both. A consumer accepting the gateway's observation alone can verify only the envelope layer.

**Strict verification path for the `aeoess-bound-demo` fixture** (canonical reference implementation):

```javascript
// Reference implementation in insumer-examples/wallet-resolve.js: verifyAPSWalletRefBindings()
const fixture = await fetch('https://raw.githubusercontent.com/aeoess/agent-passport-system/main/tests/fixtures/wallet-binding/aeoess-bound-demo.json').then(r => r.json());
const pubKey = createPublicKey({
  key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(fixture.fixture_public_key, 'hex')]),
  format: 'der', type: 'spki'
});
for (const ref of envelope.wallet_ref) {
  const payload = canonicalize({
    passport_id: envelope.agent_id,
    chain: ref.chain,
    address: ref.address,
    bound_at: ref.bound_at
  });
  const ok = verify(null, Buffer.from(payload, 'utf8'), pubKey, Buffer.from(ref.binding_sig, 'hex'));
  // ok === true means this wallet is cryptographically bound to the passport
}
```

For production passports (non-fixture), the same verification logic applies, but the pubkey is fetched from the passport object's `publicKey` field rather than the fixture file. The canonical payload shape and canonicalization are identical.

**Wallet-binding category**: APS is wallet-bound at both layers. The `wallet_ref[]` array is inside the envelope signature scope, and each entry's `binding_sig` is inside an independent per-entry signature scope. A verifier holding only the signed bytes can prove "this specific wallet → this passport" twice over.


### 3.6 AgentID — `trust_verification`

Behavioral reliability scoring for AI agents. Measures trust level, behavioral risk, and context continuity.

| Property | Value |
|----------|-------|
| Issuer URI | `https://getagentid.dev` |
| Algorithm | EdDSA (Ed25519) |
| Key ID | `agentid-2026-03` |
| JWKS | `https://getagentid.dev/.well-known/jwks.json` |
| SDK | `getagentid` on PyPI |
| Default TTL | 1 hour |

**Getting started:** Free account, or use the public endpoints with no key.

```bash
# Verify any agent (no key required)
curl -X POST https://getagentid.dev/api/v1/agents/verify \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "agent_xxx"}'

# Get trust header (EdDSA JWT, no key required)
curl "https://getagentid.dev/api/v1/agents/trust-header?agent_id=agent_xxx"
```

Docs: [getagentid.dev/docs](https://getagentid.dev/docs)

**Signed payload fields (JWT claims, schema `version: "1.1.0"` as of 2026-04-10):**

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Schema version — currently `"1.1.0"`. |
| `agent_id` | string | Agent identifier. |
| `trust_level` | number | Numeric trust level. |
| `trust_level_label` | string | Human-readable trust level (e.g., "L2 — Verified"). |
| `context_continuity_score` | number | Context continuity metric. |
| `behavioral_risk_score` | number | Behavioral risk assessment. |
| `scarring_score` | number | Historical negative signal accumulation. |
| `negative_signals` | number | Count of negative signals. |
| `resolved_signals` | number | Count of resolved negative signals. |
| `attestation_count` | number | Total attestations issued for this agent. |
| `did` | string | Decentralized identifier (`did:web:getagentid.dev:agent:{id}`). |
| `solana_address` | string | Solana address bound to this agent (when present). |
| `wallet_address` | string | EVM wallet address bound to this agent (when present). |
| `wallet_chain` | string | Chain identifier for `wallet_address` (when present). |
| `bound_addresses` | string[] | All wallet addresses bound to this agent. |
| `subject_binding` | string | Binding type indicator — `"wallet_bound"` when the signed payload includes a wallet. |
| `evaluatedAt` | string | ISO 8601 evaluation timestamp. |

**Signing key unchanged:** kid remains `agentid-2026-03`. The schema was extended in place via the `version` field; no key rotation.

**Wallet lookup:** `GET /api/v1/agents/trust-header?wallet={address}` — OR-filter match on `solana_address` or `wallet_address`.

**Multi-category endpoint:** `GET /api/v1/agents/attestation?agent_id={id}&category={identity|behavioral|continuous-monitoring|key-lifecycle}` — returns a per-category JWS-signed envelope. Wallet binding lives in the `identity` category specifically.

**Signature:** Compact JWS (JWT) with EdDSA (Ed25519).


### 3.7 AgentGraph — `security_posture`

Source code vulnerability scanning for AI agents. Answers: has this agent's code been scanned, and what is the severity profile?

| Property | Value |
|----------|-------|
| Issuer URI | `https://agentgraph.co` |
| Algorithm | EdDSA (Ed25519) |
| Key ID | `agentgraph-security-v1` |
| JWKS | `https://agentgraph.co/.well-known/jwks.json` |
| Default TTL | 24 hours |

**Getting started:** No API key required. Any scanned entity returns a signed attestation.

```bash
# Entity lookup
curl https://agentgraph.co/api/v1/entities/{entity_id}/attestation/security

# Wallet-scoped scan lookup (resolves wallet → scanned entity → signed attestation)
curl "https://agentgraph.co/api/v1/public/scan/wallet/{wallet}?chain=ethereum"
```

Docs: [github.com/agentgraph-co/agentgraph](https://github.com/agentgraph-co/agentgraph)

**Category:** wallet-discoverable content dimension — the signed `subject.id` is `github:owner/repo` (the thing being scanned), not the wallet. The wallet is a discovery key. Consistent with the security posture semantic: the scan evaluates code, not identity.

**Signed payload fields (JWT claims):**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `SecurityPostureAttestation` |
| `issuer` | object | `{ id, name, url }` — issuer metadata. |
| `subject` | object | `{ id, entity_id, display_name }` — scanned entity. |
| `scan.result` | string | `clean`, `warnings`, or `critical`. |
| `scan.findings` | object | `{ critical, high, medium, total }` — finding counts by severity. |
| `scan.checks` | object | Boolean checks: `no_critical_findings`, `no_high_findings`, `has_readme`, `has_license`, `has_tests`. |
| `scan.positiveSignals` | array | Security best practices detected. |
| `scan.filesScanned` | number | Number of files analyzed. |
| `scan.framework` | string | Detected framework (mcp, langchain, crewai, etc.). |
| `trust.overall` | number | Composite trust score (0.0–1.0). |
| `issuedAt` | string | ISO 8601 attestation timestamp. |
| `expiresAt` | string | ISO 8601 expiration timestamp. |

**Signature:** Compact JWS (JWT) with EdDSA (Ed25519).


### 3.8 SAR (SettlementWitness) — `settlement_witness`

Post-execution delivery attestation. Answers: was the task actually delivered as specified?

| Property | Value |
|----------|-------|
| Issuer URI | `https://defaultverifier.com` |
| Algorithm | EdDSA (Ed25519) |
| Key ID | `sar-prod-ed25519-03` (current, shipped 2026-04-10) · `-02` / `-01` (legacy, compat) |
| JWKS | `https://defaultverifier.com/.well-known/jwks.json` |

**Getting started:** No API key required. POST a task spec and output to get a signed verdict.

```bash
# Attest a task outcome
curl -X POST https://defaultverifier.com/settlement-witness/attest \
  -H "Content-Type: application/json" \
  -d '{"task_id":"example","spec":{"expected":"hello"},"output":{"expected":"hello"}}'

# Wallet-indexed receipt history (signed receipts where the wallet is the counterparty)
curl "https://defaultverifier.com/settlement-witness/receipts?wallet={address}"
```

Docs: [github.com/nutstrut](https://github.com/nutstrut)

**Category:** wallet-discoverable content dimension — the `/attest` JWS signs the task outcome (not the counterparty wallet). The `/receipts?wallet=` endpoint provides wallet-indexed discovery over the receipt corpus. Counterparty as a first-class signed field in the core `/attest` payload is committed by nutstrut on-thread and in flight as of 2026-04-10; when it ships, SAR moves from wallet-discoverable to wallet-bound for post-upgrade receipts.

**Signed payload fields (JWT claims, kid `sar-prod-ed25519-03`):**

| Field | Type | Description |
|-------|------|-------------|
| `task_id_hash` | string | `sha256:...` hash of the task identifier. |
| `verdict` | string | `PASS`, `FAIL`, or `INDETERMINATE`. |
| `confidence` | number | Confidence score (0.0–1.0). |
| `reason_code` | string | Reason for the verdict (e.g., `SPEC_MATCH`). |
| `ts` | string | ISO 8601 timestamp. |
| `verifier_kid` | string | Key ID used for signing. |
| `receipt_id` | string | `sha256:...` derived from the signed core. |
| `counterparty` | string | Wallet address (new in kid `-03`, shipped 2026-04-10). When present, the wallet is inside signature scope — this makes `settlement_witness` a wallet-bound dimension for post-upgrade receipts. |

**Signature:** Compact JWS (JWT) with EdDSA (Ed25519).

Legacy receipts signed under kids `-01` or `-02` do not contain `counterparty` in the signed bytes and remain wallet-discoverable only via the `/receipts?wallet=` transport lookup.


### 3.9 Revettr — `compliance_risk`

Counterparty risk scoring. Answers: is the wallet on a sanctions list, does it look like a clean counterparty, what is the regulatory exposure?

| Property | Value |
|----------|-------|
| Issuer URI | `did:web:revettr.com` |
| Algorithm | ES256 (P-256) |
| Key ID | `revettr-attest-v1` |
| JWKS | `https://revettr.com/.well-known/jwks.json` |
| Default TTL | 1 hour |

**Getting started:** No API key required. Keyless `POST /v1/attest` accepts a wallet address and returns a signed compliance risk attestation. Rate-limited to 10 requests per minute per IP.

```bash
curl -X POST https://revettr.com/v1/attest \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"0x..."}'
```

Discovery: `GET https://revettr.com/.well-known/risk-check.json`

**Signed payload fields (JWT claims):**

| Field | Type | Description |
|-------|------|-------------|
| `iss` | string | `did:web:revettr.com` |
| `sub` | string | Wallet address being scored. |
| `iat` | number | Unix timestamp at issuance. |
| `exp` | number | Unix timestamp at expiration (iat + 3600). |
| `category` | string | Always `compliance_risk`. |
| `attestation_type` | string | Always `compliance_risk`. |
| `score` | number | Composite compliance score (0–100). |
| `tier` | string | `low`, `medium`, `high`, or `critical`. |
| `confidence` | number | Confidence in the score (0.0–1.0), based on signal availability. |
| `flags` | array | Behavioral flags (e.g. `wallet_established`, `sanctions_clear`, `wallet_high_activity`). |
| `signals` | object | Per-signal sub-scores: `domain`, `ip`, `wallet`, `sanctions`. |
| `input_hash` | string | SHA-256 of the input parameters for replay detection. |

**Refresh hint:** Event-driven, with `events: ["ofac_sdn_update", "eu_consolidated_update", "un_sc_update"]` and `max_age_seconds: 43200`.

**Signature:** Compact JWS (JWT) with ES256 (P-256).

**Coverage:** EVM only — Base, Ethereum, Optimism, Arbitrum (chain-agnostic at the `/v1/attest` endpoint, which scans across all 4 by default).


### 3.10 RNWY Wallet Intelligence — `wallet_intelligence`

Operator-level wallet intelligence. Answers "what does RNWY know about the operator wallet itself as an actor" — tenure, commerce history, agent ownership, review behavior, and sybil detection reactivity. Distinct from `behavioral_trust` (agent-level), which answers "is this agent trustworthy." The two dimensions compose — a high-behavioral-trust agent owned by a low-signal-depth operator is a meaningfully different risk than the same agent owned by a deeply established operator.

| Property | Value |
|----------|-------|
| Issuer URI | `https://rnwy.com` |
| Algorithm | ES256 (ECDSA P-256) |
| Key ID | `rnwy-wallet-v1` |
| JWKS | `https://rnwy.com/.well-known/jwks.json` |
| Default TTL | 24 hours |

**Getting started:** No API key required.

```bash
curl "https://rnwy.com/api/wallet-score?address={wallet}"
```

Docs: [rnwy.com/api](https://rnwy.com/api)

**Signed payload fields (JWT claims):**

| Field | Type | Description |
|-------|------|-------------|
| `iss` | string | Issuer identifier. |
| `sub` | string | Wallet address (JWT-style subject). |
| `wallet` | string | Wallet address (explicit alias). |
| `signalDepth` | number | 0–95. Observational tenure, commerce history, agent ownership, review behavior. |
| `riskIntensity` | number | 0–100. Sybil detection reactivity. Zero means clean. Independent from `signalDepth`. |
| `quadrant` | string | e.g. `high_depth_low_risk`, `high_depth_high_risk`, etc. |
| `activityZone` | string | Named zone — `Established`, `Emerging`, etc. |
| `riskZone` | string | Named zone — `Clean`, `Elevated`, etc. |
| `issuedAt` | string | ISO 8601 — when the score was computed. |
| `verifiedAt` | string | ISO 8601 — request time. |
| `expiry` | string | ISO 8601 — end of validity window. |

**Unscored wallets** return a signed `{ found: false, wallet, issuedAt }` envelope — cryptographic proof of absence rather than unsigned JSON. Downstream consumers that want to deny-list on "no positive signal" can rely on a verifiable negative claim.

**Chain coverage:** EVM only as of 2026-04-10.

**Signature:** Compact JWS (JWT) with ES256.


---

## 4. Verification Algorithm

For each attestation entry in `attestations[]`:

1. **Check expiry.** If `expiry` is present and in the past, move the entry to `expired[]`. If `expiry` is absent, compute expiry from `attestedAt` (or `iat` / `timestamp`) plus the issuer's default TTL. If no timing fields are present, skip expiry check.

2. **Determine signature format.** If `sig` contains exactly two `.` characters, treat it as a compact JWS (JWT). Otherwise, treat it as a base64-encoded raw signature.

3. **Fetch the public key.** HTTP GET the `jwks` URL. Find the key where `kid` matches. Implementations SHOULD cache JWKS responses (recommended: 1 hour TTL).

4. **Verify the signature.**

   **Raw signature path** (P1363 / raw bytes):
   - Decode `sig` from base64 to bytes.
   - Compute the signing input: `JSON.stringify(signed)` encoded as UTF-8.
   - For ES256: convert P1363 format (`r || s`, 64 bytes) to DER, then verify with SHA-256 and the P-256 public key.
   - For EdDSA: verify the raw signature bytes directly against the signing input using the Ed25519 public key (no hash — Ed25519 hashes internally).

   **JWT path** (compact JWS):
   - Split `sig` on `.` into `[header, payload, signature]`.
   - The signing input is `header.payload` (the first two segments joined by `.`).
   - Decode `signature` from base64url to bytes.
   - For ES256: convert P1363 to DER, verify with SHA-256 and P-256.
   - For EdDSA: verify raw bytes directly against signing input with Ed25519.

5. **Evaluate policy.** After verifying all entries, check whether the relying party's `requiredTypes` are all present and valid. Policy is the relying party's responsibility — the payload carries no policy.

### Pseudocode

```
function verifyMultiAttestation(payload, requiredTypes):
    results = []
    for att in payload.attestations:
        if isExpired(att):
            results.push({ type: att.type, status: "expired" })
            continue
        key = fetchJWKS(att.jwks, att.kid, att.alg)
        if isJWT(att.sig):
            valid = verifyJWT(att.sig, key, att.alg)
        else:
            message = JSON.stringify(att.signed)
            valid = verifyRaw(att.sig, message, key, att.alg)
        results.push({ type: att.type, status: valid ? "verified" : "failed" })

    missing = requiredTypes.filter(t => !results.find(r => r.type == t && r.status == "verified"))
    return { valid: missing.length == 0, results, missing }
```

---

## 5. Security Considerations

### 5.1 JWKS Integrity

Each issuer's JWKS endpoint is the root of trust for that issuer. Implementations MUST fetch JWKS over HTTPS. Pinning issuer URIs to expected JWKS URLs is RECOMMENDED for high-security deployments.

### 5.2 Replay and Expiry

Attestations are time-limited. Relying parties MUST check expiry before accepting an attestation. The `expiry` field, when present, is authoritative. When absent, relying parties SHOULD enforce a default TTL no longer than 30 minutes.

Attestation IDs (where provided by the issuer, e.g., InsumerAPI's `id` field or a JWT `jti` claim) MAY be used for replay detection.

### 5.3 No Cross-Issuer Trust

Each attestation is independently verifiable. A valid signature from one issuer implies nothing about the validity or trustworthiness of another issuer in the same payload. The payload is a bundle, not a chain of trust.

### 5.4 Payload Integrity

The multi-attestation envelope itself is unsigned. The `attestations` array can be reordered, entries can be removed, or entries from `expired[]` can be moved back to `attestations[]`. Relying parties MUST NOT rely on the envelope's structure for security — only on individual attestation signatures and their expiry. If envelope integrity is required, the relying party should sign the entire payload at the application layer.

### 5.5 Condition Tamper Detection

For `wallet_state` attestations, each result includes a `conditionHash` (SHA-256). Relying parties that submitted conditions can recompute the hash and compare it to the signed value, ensuring the issuer evaluated the exact conditions that were requested.

### 5.6 Privacy

`wallet_state` attestations expose boolean results (`met: true/false`), not balances. This is by design — the relying party learns whether a threshold was satisfied, not how much the wallet holds.

---

## 6. Reference Implementation

[`multi-attest-verify.js`](./multi-attest-verify.js) in this repository. Zero dependencies — uses Node.js built-in `crypto` and `https` modules only.

```js
const { verifyMultiAttestation } = require('./multi-attest-verify');

const result = await verifyMultiAttestation(payload, {
  requiredTypes: ['wallet_state', 'behavioral_trust']
});

if (result.valid) {
  // All required attestation types are present and verified
}
```

The verifier:
- Fetches and caches JWKS keys (1-hour TTL)
- Auto-detects signature format (raw base64 vs. compact JWS)
- Verifies ES256 (P-256) and EdDSA (Ed25519)
- Checks expiry and separates expired entries
- Evaluates `requiredTypes` policy
- Runs all signature verifications in parallel

---

## Appendix A: JWKS Endpoints

| Issuer | JWKS URL |
|--------|----------|
| InsumerAPI | `https://insumermodel.com/.well-known/jwks.json` |
| ThoughtProof | `https://api.thoughtproof.ai/.well-known/jwks.json` |
| RNWY | `https://rnwy.com/.well-known/jwks.json` |
| Maiat | `https://app.maiat.io/.well-known/jwks.json` |
| APS | `https://gateway.aeoess.com/.well-known/jwks.json` |
| AgentID | `https://getagentid.dev/.well-known/jwks.json` |
| AgentGraph | `https://agentgraph.co/.well-known/jwks.json` |
| SAR | `https://defaultverifier.com/.well-known/jwks.json` |

## Appendix B: Algorithm Support Matrix

| Algorithm | Curve | Issuers | Signature Encoding |
|-----------|-------|---------|-------------------|
| ES256 | P-256 | InsumerAPI, RNWY (behavioral_trust + wallet_intelligence), Maiat, Revettr | P1363 base64 or JWT |
| EdDSA | Ed25519 | ThoughtProof, APS, AgentID, AgentGraph, SAR | JWT |
