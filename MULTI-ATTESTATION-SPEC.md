# Multi-Attestation Payload Format

**Version:** 1.0
**Status:** Draft
**Date:** 2026-03-23
**Discussion:** [insumer-examples#1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1)
**Blog post:** [Multi-Issuer Verification](https://insumermodel.com/blog/multi-attestation-four-issuers-one-verification-pass.html)

---

## Abstract

The Multi-Attestation Payload Format defines a composable envelope for bundling independently signed attestations from multiple issuers into a single verifiable object. Each attestation is self-describing — it carries its own algorithm, key identifier, and JWKS discovery endpoint. No shared registry or coordination between issuers is required. A relying party selects attestations by `type`, fetches each issuer's public key via standard JWKS, and verifies signatures independently.

This format emerged from convergence between eight independent issuers: InsumerAPI (wallet state), ThoughtProof (reasoning integrity), RNWY (behavioral trust), Maiat (job performance), APS (passport grade), AgentID (trust verification), AgentGraph (security posture), and SAR (settlement witness). Each issuer publishes a JWKS endpoint and signs attestations using either ES256 or EdDSA. The payload format is algorithm-agnostic and supports both raw signatures (base64-encoded P1363) and compact JWS (JWT).

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

---

## 2. Attestation Types

| Type | Issuer | Algorithm | Signature Format | Default TTL |
|------|--------|-----------|------------------|-------------|
| `wallet_state` | InsumerAPI | ES256 | base64 P1363 (or JWT when `format: "jwt"` requested) | 30 min |
| `reasoning_integrity` | ThoughtProof | EdDSA (Ed25519) | compact JWS (JWT) | per-issuer |
| `behavioral_trust` | RNWY | ES256 | base64 P1363 | 24 hours |
| `job_performance` | Maiat | ES256 | compact JWS (JWT) | 30 min |
| `passport_grade` | APS | EdDSA (Ed25519) | compact JWS (JWT) | per-issuer |
| `trust_verification` | AgentID | EdDSA (Ed25519) | compact JWS (JWT) | 1 hour |
| `security_posture` | AgentGraph | EdDSA (Ed25519) | compact JWS (JWT) | 24 hours |
| `settlement_witness` | SAR | EdDSA (Ed25519) | compact JWS (JWT) | per-issuer |

---

## 3. Per-Issuer Schemas

### 3.1 InsumerAPI — `wallet_state`

Privacy-preserving on-chain verification. Returns signed booleans across 33 chains (30 EVM + Solana + XRPL + Bitcoin). No balances exposed.

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

On-chain behavioral trust scoring with sybil detection across ERC-8004, Olas, Virtuals, and SATI (Solana) agent registries. Keyless (no API key required). 150,000+ agents indexed, 121,000+ wallets scored, 12 EVM chains + Solana.

| Property | Value |
|----------|-------|
| Issuer URI | `https://rnwy.com` |
| Algorithm | ES256 (ECDSA P-256) |
| Key ID | `rnwy-trust-v1` |
| JWKS | `https://rnwy.com/.well-known/jwks.json` |
| On-chain oracle | `0xD5fdccD492bB5568bC7aeB1f1E888e0BbA6276f4` (Base, 150K+ agents) |
| SDK | `rnwy-sdk` on npm |
| Default TTL | 24 hours (nightly pipeline refresh at 3 AM UTC) |

**Getting started:** No API key required. Install the SDK and start querying.

```bash
npm install rnwy-sdk
```

Docs: [rnwy.com/api](https://rnwy.com/api)

**Signed payload fields:**

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | number | Agent identifier. |
| `chain` | string | Chain where the behavior was evaluated. |
| `registry` | string | Registry identifier (`erc8004`, `olas`, `sati`). |
| `score` | number | Trust score (0–95). |
| `tier` | string | Trust tier: `flagged`, `limited`, `developing`, `established`. |
| `badges` | array | Earned badges and warnings (e.g., `original_owner`, `low_history_reviewers`, `sybil_heavy`). |
| `sybilSeverity` | string | Sybil risk severity level (`none`, `light`, `moderate`, `heavy`). |
| `sybilSignals` | array | Specific sybil indicators: `sweep_pattern`, `inhuman_velocity`, `score_clustering`, `coordination`, `common_funder`. |
| `attestedAt` | string | ISO 8601 attestation timestamp. |

**Signature:** Base64-encoded P1363 (`r || s`, 64 bytes) over `JSON.stringify(signed)`.

**Dual-score model (evidence extension):**

Rather than a single trust score, RNWY produces two independent dimensions. An agent can have high observability and high risk simultaneously — collapsing these into one number loses information.

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

**Reference case:** Agent [Base #1380](https://rnwy.com/explorer/base/1380) — 1,520 reviews, score of zero. 99.7% of reviewers have wallets created the same day they reviewed, four sybil signals firing, 0% of reviews tied to on-chain commerce. A star-counting system would rank it highly.

**Live endpoints:**

| Endpoint | URL |
|----------|-----|
| Trust check (signed) | `GET https://rnwy.com/api/trust-check?chain=base&id={agentId}` |
| Explorer (full evidence) | `https://rnwy.com/explorer/{chain}/{agentId}` |
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

Agent identity verification with graded passports. Measures how deeply an agent's identity has been verified.

| Property | Value |
|----------|-------|
| Issuer URI | `https://gateway.aeoess.com` |
| Algorithm | EdDSA (Ed25519) |
| Key ID | `gateway-v1` |
| JWKS | `https://gateway.aeoess.com/.well-known/jwks.json` |

**Getting started:** No API key required. Public trust endpoint.

```bash
curl https://gateway.aeoess.com/api/v1/public/trust/{agentId}/attestation
```

Docs: [github.com/aeoess/agent-passport-system](https://github.com/aeoess/agent-passport-system)

**Signed payload fields:**

| Field | Type | Description |
|-------|------|-------------|
| `agent_id` | string | Agent identifier. |
| `grade` | number | Passport grade (0-3). |
| `grade_label` | string | Human-readable grade label. |
| `risk_level` | string | Risk assessment level. |
| `context_continuity` | object | Context continuity metrics. |
| `has_delegation` | boolean | Whether the agent has active delegation. |
| `evaluatedAt` | string | ISO 8601 evaluation timestamp. |

**Signature:** Compact JWS (JWT) with EdDSA (Ed25519).


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

**Signed payload fields (JWT claims):**

| Field | Type | Description |
|-------|------|-------------|
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
| `evaluatedAt` | string | ISO 8601 evaluation timestamp. |

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
curl https://agentgraph.co/api/v1/entities/{entity_id}/attestation/security
```

Docs: [github.com/agentgraph-co/agentgraph](https://github.com/agentgraph-co/agentgraph)

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
| Key ID | `sar-prod-ed25519-02` |
| JWKS | `https://defaultverifier.com/.well-known/jwks.json` |

**Getting started:** No API key required. POST a task spec and output to get a signed verdict.

```bash
curl -X POST https://defaultverifier.com/settlement-witness/attest \
  -H "Content-Type: application/json" \
  -d '{"task_id":"example","spec":{"expected":"hello"},"output":{"expected":"hello"}}'
```

Docs: [github.com/nutstrut](https://github.com/nutstrut)

**Signed payload fields (JWT claims):**

| Field | Type | Description |
|-------|------|-------------|
| `task_id_hash` | string | `sha256:...` hash of the task identifier. |
| `verdict` | string | `PASS`, `FAIL`, or `INDETERMINATE`. |
| `confidence` | number | Confidence score (0.0–1.0). |
| `reason_code` | string | Reason for the verdict (e.g., `SPEC_MATCH`). |
| `ts` | string | ISO 8601 timestamp. |
| `verifier_kid` | string | Key ID used for signing. |
| `receipt_id` | string | `sha256:...` derived from the signed core. |

**Signature:** Compact JWS (JWT) with EdDSA (Ed25519).


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
| ES256 | P-256 | InsumerAPI, RNWY, Maiat | P1363 base64 or JWT |
| EdDSA | Ed25519 | ThoughtProof, APS, AgentID, AgentGraph, SAR | JWT |
