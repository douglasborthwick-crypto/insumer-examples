# Crosswalk — `MULTI-ATTESTATION-SPEC.md` Signal Types → A2A RFC #1734 Categories

**Target:** [A2A discussion #1734 — Composable Trust Evidence Format for Multi-Provider Agent Attestations](https://github.com/a2aproject/A2A/discussions/1734), v0.2 draft.

**Contributor:** Douglas Borthwick (InsumerAPI), contributing at @AlexanderLawson17's explicit request (*"a canonical mapping of the 10 MULTI-ATTESTATION-SPEC signal types to the RFC taxonomy is exactly the thing that prevents provider fragmentation as consumers start citing categories instead of provider names"*).

**Purpose:** Prevent provider fragmentation across two parallel specs. Ten signal types are already stamped into production signed attestations under `MULTI-ATTESTATION-SPEC.md`. The same underlying providers are the reference implementations for A2A RFC #1734's category taxonomy. Consumers should be able to cite either vocabulary without renaming what is already on the wire.

**Source of truth for the signal type column:** [`MULTI-ATTESTATION-SPEC.md`](../MULTI-ATTESTATION-SPEC.md) sections 3.1–3.10 in this repository. Every field name, algorithm, and JWKS endpoint below is verified against the live `JSON.stringify(signed)` payload each issuer returns as of 2026-04-10.

**Source of truth for the RFC category column:** A2A discussion #1734 v0.1 draft plus the @eriknewton (`transactional`, `sovereignty`), @AlexanderLawson17 (`compliance_risk`), and this-contribution (`wallet_state`) category additions pending v0.2.

---

## Category taxonomy assumed by this crosswalk

The v0.1 draft defines five categories. Three more were added in the discussion, and one is proposed in this contribution. The crosswalk assumes all nine are live for v0.2:

| # | Category | Origin | What it answers |
|---|----------|--------|-----------------|
| 1 | `static_analysis` | v0.1 | Is the code safe to run? |
| 2 | `behavioral` | v0.1 | Does the agent act within bounds at runtime? |
| 3 | `continuous_monitoring` | v0.1 | Is the agent still behaving over time? |
| 4 | `identity` | v0.1 | Who is the agent and is that identity verifiable? |
| 5 | `peer_review` | v0.1 | Do other agents vouch for it? |
| 6 | `transactional` | eriknewton (Verascore) | Has it committed and delivered on structured interactions? |
| 7 | `sovereignty` | eriknewton (Verascore) | What is the agent's autonomy and self-custody posture? |
| 8 | `compliance_risk` | AlexanderLawson17 (Revettr) | Is the wallet, operator, and infrastructure regulatorily clean? |
| 9 | `wallet_state` | this contribution (InsumerAPI) | Does this wallet satisfy on-chain conditions at a specific block? |

---

## Crosswalk table

| `MULTI-ATTESTATION-SPEC` signal type | Issuer | Proposed RFC #1734 category | Fit | Notes |
|---|---|---|---|---|
| `wallet_state` | InsumerAPI | `wallet_state` | **Direct** | Foundation layer. 33 chains (30 EVM + Solana + XRPL + Bitcoin). Per-condition `blockNumber`, `blockTimestamp`, `conditionHash`. `sub` claim (JWT) or `wallet` field (`/v1/trust`) is wallet-bound inside signature scope. ES256 P1363 or compact JWS. |
| `compliance_risk` | Revettr | `compliance_risk` | **Direct** | Matches Alexander Lawson's own Section 3.8 draft. ES256 compact JWS. `sub` is wallet-bound. Sanctions, WHOIS, IP reputation, wallet screening. |
| `reasoning_integrity` | ThoughtProof | `behavioral` (subtype: `reasoning_integrity`) | **Close** | EdDSA compact JWS. Signed `claimHash` + `verdict` + `mdi` + `confidence`. Commits to the soundness of a reasoning chain, not to a wallet. Best modeled as a behavioral subtype rather than a new top-level category — behavioral already covers "does the agent act within bounds," and reasoning soundness is the per-invocation version of that question. Not wallet-bound by design (wallet does not appear in signed bytes). |
| `behavioral_trust` | RNWY (`rnwy-trust-v2`) | `behavioral` | **Direct** | ES256 P1363. Signed `owner` field is wallet-bound as of the 2026-04-10 `rnwy-trust-v2` kid rotation. Sybil detection, dual-score (`signal_depth` + `risk_intensity`), agent-level. 150K+ agents indexed across ERC-8004, Olas, Virtuals, SATI. |
| `wallet_intelligence` | RNWY (`rnwy-wallet-v1`) | `wallet_state` (subtype: `wallet_intelligence`) **or** `behavioral` | **Dual-home candidate** | ES256 compact JWS. Signed `sub` + `wallet` fields are both wallet-bound. Operator-level wallet tenure, commerce history, agent ownership, review behavior. Mechanically a `wallet_state` signal (derived from on-chain state), but semantically closer to `behavioral` (it scores the wallet's historical behavior pattern, not its current position). Proposing dual-home: discoverable under both categories with a primary category of `wallet_state` and a `behavioral_overlap: true` flag. Discuss at v0.2 review. |
| `job_performance` | Maiat | `transactional` | **Direct** | ES256 compact JWS. Signed `agent` field. Completed job count, completion rate, sybil flags, tier. Maps cleanly to Erik's `transactional` definition — "has the agent committed and delivered on structured interactions." |
| `passport_grade` | APS (Agent Passport System) | `identity` + `sovereignty` (dual-home) | **Dual-home** | EdDSA compact JWS. Signed `agent_id`. Passport grade (0–3) measures identity evidence tier depth — directly `identity`. Governance-attestation variant emitted by the same issuer covers active constraints and delegation chain — maps to Erik's `sovereignty` ("how much control the agent has over itself"). Dual-homing is appropriate because APS deliberately covers both layers. |
| `trust_verification` | AgentID | `identity` | **Direct** | EdDSA compact JWS (schema `version: "1.1.0"` as of 2026-04-10). Signed `did`, `wallet_address`, `solana_address`, `bound_addresses[]`. Trust level, behavioral risk score, context continuity score, scarring, negative/resolved signal counts. `subject_binding: "wallet_bound"` field signals wallet-in-signature-scope. `identity` is the primary home; the behavioral risk/context continuity fields overlap `behavioral` and could be dual-homed if the WG prefers. |
| `security_posture` | AgentGraph | `static_analysis` | **Direct** | EdDSA compact JWS. Signed `subject.id` is `github:owner/repo` — this is a wallet-discoverable content dimension, not wallet-bound. Scan findings by severity, composite trust score, framework detection, filesScanned count. Maps cleanly to Erik's `static_analysis`. |
| `settlement_witness` | SAR (SettlementWitness) | `transactional` | **Direct** | EdDSA compact JWS. kid `sar-prod-ed25519-03` (shipped 2026-04-10) puts `counterparty` (wallet) inside signature scope — wallet-bound for new receipts. Signed `task_id_hash`, `verdict`, `confidence`, `reason_code`, `receipt_id`. Legacy `-02`/`-01` receipts are wallet-discoverable only via `/receipts?wallet=` transport lookup. Maps cleanly to Erik's `transactional` with one caveat: `transactional` as drafted covers negotiation/commitment/delivery; SAR specifically covers the post-execution delivery verdict. If the WG wants finer taxonomy, `transactional.settlement_witness` as a named subtype. |

---

## Summary — category coverage after the crosswalk

Of the nine RFC #1734 categories (five v0.1 + four additions):

| Category | Reference implementations that land here |
|---|---|
| `static_analysis` | AgentGraph (`security_posture`) |
| `behavioral` | RNWY `rnwy-trust-v2` (`behavioral_trust`), ThoughtProof (`reasoning_integrity`, subtype), AgentID partial (`trust_verification` behavioral overlap) |
| `continuous_monitoring` | No direct reference implementation from MULTI-ATTESTATION-SPEC.md (RNWY's nightly pipeline cadence is the closest operational fit; kenneives confirmed AgentGraph covers the on-chain monitoring variant separately in the RFC). |
| `identity` | APS (`passport_grade`, primary), AgentID (`trust_verification`, primary) |
| `peer_review` | No direct reference implementation from MULTI-ATTESTATION-SPEC.md. Candidate fit: the reviewer-credibility and reviewer-diversity fields inside RNWY's evidence extension (§3.3.1 of MULTI-ATTESTATION-SPEC.md) could be surfaced as a `peer_review` subtype if the WG wants, but the primary signed dimension is `behavioral_trust`. |
| `transactional` | Maiat (`job_performance`), SAR (`settlement_witness`) |
| `sovereignty` | APS (`passport_grade` governance-attestation variant) |
| `compliance_risk` | Revettr (`compliance_risk`) |
| `wallet_state` | InsumerAPI (`wallet_state`), RNWY `rnwy-wallet-v1` (`wallet_intelligence`, dual-home with behavioral) |

Every category except `continuous_monitoring` and `peer_review` has at least one reference implementation already in production under `MULTI-ATTESTATION-SPEC.md` — and the A2A RFC draft already identifies AgentGraph (continuous monitoring) and JKHeadley/MoltBridge (peer review adjacent) as the candidate reference implementations for those two slots, so the combined coverage across both specs is complete on day one of v0.2.

---

## Consumer-side implications

### If a consumer cites the A2A RFC vocabulary

A consumer that cites `category: "wallet_state"` in a policy can consume InsumerAPI envelopes directly with no mapping layer. The JWS header, JWKS endpoint, and wallet-binding semantics are identical.

A consumer that cites `category: "behavioral"` will see RNWY's `rnwy-trust-v2` envelope under `behavioral_trust` and needs no translation — both specs agree the signal type is behavioral.

A consumer that cites `category: "transactional"` will see both Maiat (`job_performance`) and SAR (`settlement_witness`) envelopes, which is the correct semantic bundle — both issuers sign commitment/delivery outcomes, they just slice the problem differently.

### If a consumer cites the MULTI-ATTESTATION-SPEC vocabulary

A consumer that cites `type: "wallet_state"` can discover InsumerAPI as the canonical provider via the issuer URI in the envelope. The RFC category name is informational metadata alongside — not a replacement for — the signed `type` field.

A consumer that cites `type: "behavioral_trust"` will land on RNWY directly. The RFC category (`behavioral`) is coarser but compatible.

### Dual-vocabulary envelope

The cleanest path is for each issuer to emit **both** vocabularies in the envelope:

```json
{
  "provider": {
    "id": "https://rnwy.com",
    "category": "behavioral"
  },
  "attestation": {
    "type": "behavioral_trust",
    "schema": "rnwy-trust-v2",
    ...
  }
}
```

- `provider.category` cites the RFC #1734 taxonomy (coarse, cross-provider interop).
- `attestation.type` cites the MULTI-ATTESTATION-SPEC signal type (fine, provider-specific schema).
- Consumers choose the granularity they need. Issuers emit both.

This is what `wallet_state` and `compliance_risk` already do in the sample envelopes above: the category is the coarse home, the type is the precise wire schema.

---

## Open questions for v0.2 review

1. **`wallet_intelligence` dual-home.** Should RNWY `rnwy-wallet-v1` be primarily `wallet_state` with a `behavioral_overlap` flag, or should the RFC introduce a `wallet_behavioral` category to cleanly separate "on-chain position at block N" from "on-chain behavioral history of the wallet as an actor"? The two signals compose differently and consumers may want to weight them separately.

2. **`reasoning_integrity` homing.** ThoughtProof's signed `claimHash` + `verdict` pattern does not fit `behavioral` perfectly — behavioral implies runtime bound-checking, reasoning soundness is pre-runtime. Candidate homes: `behavioral.reasoning_integrity` (subtype), or a new top-level `reasoning_attestation` category if enough providers converge on it. One reference implementation is not enough to justify a new top-level category yet, so subtype is the v0.2 recommendation.

3. **`passport_grade` dual-home.** APS emits both an identity-evidence grade and a governance-attestation envelope from the same issuer. Dual-homing under `identity` + `sovereignty` is the cleanest mapping today. An alternative is to split the issuer into two reference implementations — one under each category — but that loses the fact that APS deliberately couples the two dimensions. Recommendation: dual-home via array: `"category": ["identity", "sovereignty"]`.

4. **`peer_review` coverage.** No MULTI-ATTESTATION-SPEC signal type lands cleanly here. The RNWY reviewer-credibility fields (§3.3.1 evidence extension) are the closest fit but are currently surfaced as sub-fields of `behavioral_trust` rather than a standalone signal. If the WG wants `peer_review` to be first-class, either RNWY can emit a second envelope type for the reviewer-credibility slice, or a different provider (e.g., aeoess's governance-attestation vouch chains) fills the slot. Both are viable. Defer to @rnwy and @aeoess.

5. **`continuous_monitoring` vs `wallet_state`.** Some of the RNWY behavioral dimensions (sybil reactivity, velocity-based fraud detection) are mechanically continuous-monitoring — they depend on a rolling observation window. But they are signed once per request, not on a pipeline cadence. Is that still `continuous_monitoring`, or is the category specifically for issuers that run standing observation pipelines and emit time-series attestations? Recommendation: `continuous_monitoring` is for the latter (standing pipeline model, nightly refresh), and point-in-time signals derived from monitoring data stay under their primary category. AgentGraph's on-chain monitoring fits the former; RNWY's sybil reactivity stays under `behavioral`.

---

## Maintenance

This crosswalk is versioned alongside `MULTI-ATTESTATION-SPEC.md`. When either spec changes — new issuer added, new category added, signed fields rotated — the corresponding row in this document updates in the same PR. The canonical location is this file in the `insumer-examples` repository; mirrors in the A2A RFC source tree or a future `trust-evidence-format` org should be kept in sync by cross-PR.

**Last reconciled:** 2026-04-10, against MULTI-ATTESTATION-SPEC.md §3.1–3.10 and A2A discussion #1734 comments through comment `16523189`.

---

## Reproducing a row

Every row in the crosswalk is backed by a live signed envelope from the issuer in column 2. To validate a row yourself, pull the envelope and decode it. Most issuers are keyless; the `wallet_state` row requires a free InsumerAPI key:

```bash
# Free InsumerAPI key — returned immediately, no credit card
curl -X POST https://api.insumermodel.com/v1/keys/create \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","appName":"crosswalk-validation","tier":"free"}'
```

The other issuers are keyless — see the "Getting started" block inside each `MULTI-ATTESTATION-SPEC.md` section (3.2 ThoughtProof, 3.3 RNWY, 3.4 Maiat, 3.5 APS, 3.6 AgentID, 3.7 AgentGraph, 3.8 SAR, 3.9 Revettr, 3.10 RNWY wallet intelligence) for the exact endpoint to hit. Every envelope can be verified offline against the issuer's JWKS — see MULTI-ATTESTATION-SPEC.md §4 (Verification Algorithm) and [`multi-attest-verify.js`](../multi-attest-verify.js) in this repository for the zero-dependency reference verifier.
