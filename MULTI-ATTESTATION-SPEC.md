# Multi-Attestation Payload Format

**Version:** 1.0
**Status:** Draft
**Date:** 2026-03-23
**Discussion:** [insumer-examples#1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1)

---

## Abstract

The Multi-Attestation Payload Format defines a composable envelope for bundling independently signed attestations from multiple issuers into a single verifiable object. Each attestation is self-describing — it carries its own algorithm, key identifier, and JWKS discovery endpoint. No shared registry or coordination between issuers is required. A relying party selects attestations by `type`, fetches each issuer's public key via standard JWKS, and verifies signatures independently.

This format emerged from convergence between four independent issuers: InsumerAPI (wallet state), ThoughtProof (reasoning integrity), RNWY (behavioral trust), and Maiat (job performance). Each issuer publishes a JWKS endpoint and signs attestations using either ES256 or EdDSA. The payload format is algorithm-agnostic and supports both raw signatures (base64-encoded P1363) and compact JWS (JWT).

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

---

## 3. Per-Issuer Schemas

### 3.1 InsumerAPI — `wallet_state`

Privacy-preserving on-chain verification. Returns signed booleans across 32 chains (30 EVM + Solana + XRPL). No balances exposed.

| Property | Value |
|----------|-------|
| Issuer URI | `https://api.insumermodel.com` |
| Algorithm | ES256 (ECDSA P-256) |
| Key ID | `insumer-attest-v1` |
| JWKS | `https://insumermodel.com/.well-known/jwks.json` |
| Also | `GET /v1/jwks` (API endpoint, 24h cache) |

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

On-chain behavioral trust scoring with sybil detection. Keyless (no API key required).

| Property | Value |
|----------|-------|
| Issuer URI | `https://rnwy.com` |
| Algorithm | ES256 (ECDSA P-256) |
| Key ID | `rnwy-trust-v1` |
| JWKS | `https://rnwy.com/.well-known/jwks.json` |
| On-chain oracle | `0xD5fdccD492bB5568bC7aeB1f1E888e0BbA6276f4` (Base) |
| SDK | `rnwy-sdk` on npm |
| Default TTL | 24 hours |

**Signed payload fields:**

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | string | Agent or wallet identifier. |
| `chain` | string | Chain where the behavior was evaluated. |
| `registry` | string | Registry identifier. |
| `score` | number | Trust score. |
| `tier` | string | Trust tier derived from score. |
| `badges` | array | Earned trust badges. |
| `sybilSeverity` | string | Sybil risk severity level. |
| `sybilFlags` | array | Specific sybil indicators detected. |
| `updatedAt` | string | Last score update timestamp. |
| `attestedAt` | string | ISO 8601 attestation timestamp. |

**Signature:** Base64-encoded P1363 (`r || s`, 64 bytes) over `JSON.stringify(signed)`.


### 3.4 Maiat — `job_performance`

Agent job performance scoring. Keyless (no API key required, rate-limited to 10 req/min).

| Property | Value |
|----------|-------|
| Issuer URI | `https://app.maiat.io` |
| Algorithm | ES256 (ECDSA P-256) |
| Key ID | `maiat-trust-v1` |
| JWKS | `https://app.maiat.io/.well-known/jwks.json` |
| Default TTL | 30 minutes |

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

## Appendix B: Algorithm Support Matrix

| Algorithm | Curve | Issuers | Signature Encoding |
|-----------|-------|---------|-------------------|
| ES256 | P-256 | InsumerAPI, RNWY, Maiat | P1363 base64 or JWT |
| EdDSA | Ed25519 | ThoughtProof | JWT |
