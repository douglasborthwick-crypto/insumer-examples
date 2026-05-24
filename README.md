# InsumerAPI Examples

Condition-based access infrastructure for 37 blockchains. Send a wallet and conditions, get a signed boolean. No secrets, no identity, no static credentials.

## Try It (no key needed)

```bash
curl -s https://api.insumermodel.com/v1/compliance/templates | python3 -m json.tool
```

That's a live API response. No auth required. Now get a free key and verify a wallet:

```bash
curl -s -X POST https://api.insumermodel.com/v1/keys/create \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "appName": "my-app", "tier": "free"}'
```

Free tier: **100 reads/day** + 10 verification credits. Or run the quickstart — it generates a key and makes a call in one step:

```bash
bash quickstart.sh
```

## Verify a Wallet

```bash
curl -s -X POST https://api.insumermodel.com/v1/attest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "wallet": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "conditions": [
      {
        "type": "token_balance",
        "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "chainId": 1,
        "threshold": 100,
        "decimals": 6,
        "label": "USDC >= 100 on Ethereum"
      }
    ]
  }'
```

Response — signed boolean, no balances exposed:

```json
{
  "ok": true,
  "data": {
    "attestation": {
      "id": "ATST-6DA3EB85AD032D45",
      "pass": true,
      "results": [
        {
          "condition": 0,
          "label": "USDC >= 100 on Ethereum",
          "type": "token_balance",
          "chainId": 1,
          "met": true,
          "evaluatedCondition": {
            "type": "token_balance",
            "chainId": 1,
            "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            "operator": "gte",
            "threshold": 100,
            "decimals": 6
          },
          "conditionHash": "0x554251734232c8b43062f1cf2bb51b76650d13268104d74c645f4893e67ef69c",
          "blockNumber": "0x1799043",
          "blockTimestamp": "2026-03-26T20:04:23.000Z"
        }
      ],
      "passCount": 1,
      "failCount": 0,
      "attestedAt": "2026-03-26T20:04:33.969Z",
      "expiresAt": "2026-03-26T20:34:33.969Z"
    },
    "sig": "dmNJKqnGZ9f47qpWax9gxgw1DhUKHKHrbLspTop8NWzYhv2fNpVAt1gAuhUfU4xPsgXTCdrmTXI4vEE50dcfEA==",
    "kid": "insumer-attest-v1"
  },
  "meta": {
    "version": "1.0",
    "timestamp": "2026-03-26T20:04:34.153Z",
    "creditsRemaining": 9,
    "creditsCharged": 1
  }
}
```

Verify the signature offline via JWKS: `https://api.insumermodel.com/v1/jwks`

## What Wallet Auth Covers

- **Token balances**: Does this wallet hold at least X of token Y on chain Z?
- **NFT ownership**: Does this wallet own an NFT from collection Y on chain Z?
- **Multiple conditions**: Up to 10 conditions per call, across any mix of 37 chains
- **Cross-chain**: Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BNB Chain, XDC, Solana, XRPL, Bitcoin, Tron, Stellar, Sui, and 23 more EVM chains
- **Fact profiles**: 49-check composite wallet-state profile across 27 chains (`POST /v1/trust`) — no score, no opinion, just cryptographically verifiable evidence organized by dimension

Every response is signed with ECDSA P-256. Pass the wallet auth result to downstream systems as cryptographic proof without re-querying the chain.

**Who uses this:**
- **Token-gated content** — media platforms, newsletters, community access
- **Commerce** — wallet-based discounts and eligibility (WooCommerce, Shopify)
- **Compliance** — KYA (Know Your Agent) checks before DeFi interactions
- **DAO governance** — verify voting eligibility across chains
- **Agent cold-start signals** — wallet-state evidence as a baseline before behavioral history accrues for new AI agents

## Examples

| File | Language | What it does |
|------|----------|-------------|
| [quickstart.sh](quickstart.sh) | Bash | Generates a key and runs a wallet auth check — zero setup |
| [verify.js](verify.js) | Node.js | Express server with wallet auth for token-gated discounts |
| [verify.py](verify.py) | Python | On-chain verification with signature handling |
| [verify-xrpl.js](verify-xrpl.js) | Node.js | XRPL: XRP, RLUSD, USDC trust lines, NFTs, fact profiles |
| [verify-tron.js](verify-tron.js) | Node.js | Tron: native TRX, USDT-TRC20, fact profile with Tron dimension |
| [verify-stellar.js](verify-stellar.js) | Node.js | Stellar: native XLM, USDC trustline, BENJI trustline, fact profile |
| [verify-sui.js](verify-sui.js) | Node.js | Sui: native SUI, USDC, fact profile with institutional dimension |

### XRPL

```bash
curl -s -X POST https://api.insumermodel.com/v1/attest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "xrplWallet": "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn",
    "conditions": [
      {
        "type": "token_balance",
        "contractAddress": "native",
        "chainId": "xrpl",
        "threshold": 100,
        "label": "XRP >= 100"
      }
    ]
  }'
```

## On-Chain Reference Contracts

EVM Solidity contracts that consume InsumerAPI's off-chain signed attestations on-chain. The off-chain primitive issues a signed verdict over a wallet's condition set; these contracts verify the signature against the published JWKS via the RIP-7212 `P256VERIFY` precompile (`0x0100`), then expose a verifiable result to a consumer surface. Same family across three ERC consumer specs — one primitive, three consumer interfaces.

Live on chains where RIP-7212 is available: Base, Optimism, Arbitrum, Polygon, Scroll, ZKsync, Celo. Issuer JWKS: `https://api.insumermodel.com/.well-known/jwks.json` (kid `insumer-attest-v1`, P-256 / ES256).

| File | Spec | Role |
|------|------|------|
| [InsumerWalletStateVerifier.sol](InsumerWalletStateVerifier.sol) | ERC-8183 | Implements `IWalletStateVerifier` for hook-based access gating. Returns `(verified, validUntil)` keyed on `(wallet, conditionsHash)`. Anchored mode: immutable issuer pubkey at construction, relayer untrusted, signature verified on-chain via RIP-7212 before storage. |
| [InsumerTrustOracle.sol](InsumerTrustOracle.sol) | ERC-8183 | Implements `ITrustOracle` for fact-profile-based gating. Bridges `POST /v1/trust` output (`totalPassed / totalChecks`) into the `getTrustScore(address) → uint256` interface required by hooks. 30-minute freshness window matching the API's `expiresAt` TTL. |
| [InsumerKeeperHook.sol](InsumerKeeperHook.sol) | ERC-8191 | Implements `IKeeperHook` for recurring-payment cycle gating. Verifies an ECDSA P-256 attestation in `beforeKeep` before each collection. Pattern 4.2 (Trust Gating) from the IKeeperHook companion spec. |
| [InsumerAccessPredicate.sol](InsumerAccessPredicate.sol) | ERC-8257 | Implements `IAccessPredicate` for agent tool registry access gating. Decodes a seven-tuple proof (`pass`, `wallet`, `conditionHash`, `blockNumber`, `r`, `s`, `messageHash`) from the `data` parameter, verifies P-256 inline, returns `false` (no revert) on failure so `tryHasAccess` cleanly distinguishes denial from malfunction. Advertises `IAccessPredicate` + `IERC165` for registration validation. |
| [IWalletStateAttestation.sol](IWalletStateAttestation.sol) | ERC-8257 | Marker interface for the new `AccessRequirement.kind` proposed on [ethereum-magicians #28457](https://ethereum-magicians.org/t/erc-8257-agent-tool-registry/28457/3). Selector `0x7a111640 = bytes4(keccak256("walletStateAttestation()"))`, verified non-colliding with the three pinned `IRequirementTypes` markers. |
| [InsumerAccessPredicate.t.sol](InsumerAccessPredicate.t.sol) | — | Foundry test suite for `InsumerAccessPredicate.sol` — 16 cases including a happy-path that runs real ECDSA P-256 verification of a live signed attestation through the RIP-7212 precompile, plus eight failure modes (tampered signature, tampered message hash, wrong account, wrong condition hash, `pass=false`, stale, future-dated, empty data). Run with `forge test` (requires `evm_version = "osaka"` in `foundry.toml` to activate the precompile in Foundry's local REVM). |

Architectural pattern across all four production contracts: InsumerAPI signs off-chain, an authorized relayer (or the caller, for the inline predicate) supplies the signed bytes on-chain, the contract verifies the P-256 signature against the immutable issuer pubkey via RIP-7212, then exposes the verifiable result to its consumer surface (hook / oracle / predicate). The off-chain primitive is the issuer; these contracts are the consumers.

## Agent SDKs

- **MCP Server** (Claude, Cursor, Windsurf): `npx -y mcp-server-insumer` — [npm](https://www.npmjs.com/package/mcp-server-insumer)
- **LangChain** (Python agents): `pip install langchain-insumer` — [PyPI](https://pypi.org/project/langchain-insumer/)
- **GPT Actions**: Import the [OpenAPI spec](https://insumermodel.com/openapi.yaml) into any Custom GPT

## Handling `rpc_failure` Errors

If the API cannot reach an upstream blockchain data source after retries, it returns HTTP 503 with `error.code: "rpc_failure"`. No attestation is signed, no credits are charged. This is a retryable error — wait 2-5 seconds and retry.

**Important:** `rpc_failure` is NOT a verification failure. Do not treat it as `pass: false`. It means the data source was temporarily unavailable and the API refused to sign an unverified result.

```javascript
const res = await fetch(`${API}/v1/attest`, { method: "POST", headers, body });
const result = await res.json();

if (res.status === 503 && result.error?.code === "rpc_failure") {
  // Retryable — data source temporarily unavailable
  console.log("Failed sources:", result.error.failedConditions);
  // Wait 2-5s and retry
}
```

## Supported Chains (37)

**EVM (31):** Ethereum (1), BNB Chain (56), Base (8453), Avalanche (43114), Polygon (137), Arbitrum (42161), Optimism (10), XDC (50), Chiliz (88888), Soneium (1868), Plume (98866), Sonic (146), Gnosis (100), Mantle (5000), Scroll (534352), Linea (59144), zkSync Era (324), Blast (81457), Taiko (167000), Ronin (2020), Celo (42220), Moonbeam (1284), Moonriver (1285), Viction (88), opBNB (204), World Chain (480), Unichain (130), Ink (57073), Sei (1329), Berachain (80094), ApeChain (33139)

**Non-EVM (6):** Solana (`chainId: "solana"`), XRPL (`chainId: "xrpl"` — native XRP, trust line tokens, NFTs), Bitcoin (`bitcoinWallet` — native BTC, P2PKH/P2SH/bech32/Taproot), Tron (`chainId: "tron"` — native TRX, TRC-20 incl. USDT-TRC20), Stellar (`chainId: "stellar"` — native XLM, classic trustlines incl. USDC and BENJI), Sui (`chainId: "sui"` — native SUI, Sui-native tokens incl. USDC)

## Pricing

| Tier | Daily Reads | Credits | Price |
|------|-------------|---------|-------|
| Free | 100/day | 10 | $0 |
| Pro | 10,000/day | 1,000/mo | $29/mo |
| Enterprise | 100,000/day | 5,000/mo | $99/mo |

[Full pricing →](https://insumermodel.com/pricing/)

---

## Multi-Attestation Verification

Before an AI agent transacts, a relying party can verify ten signed dimensions across nine independent issuers in a single pass:

| Dimension | Question | Issuer | Algorithm |
|-----------|----------|--------|-----------|
| **Wallet State** | "What does this wallet hold?" | [InsumerAPI](https://insumermodel.com) | ES256 |
| **Compliance Risk** | "Is this counterparty sanctioned?" | [Revettr](https://revettr.com) (OFAC / EU / UN screening) | ES256 |
| **Reasoning Integrity** | "Did this agent reason correctly?" | [ThoughtProof](https://thoughtproof.ai) | EdDSA |
| **Behavioral Trust** | "Is this agent legitimate?" | [RNWY](https://rnwy.com) (150K+ agents, dual-score) | ES256 |
| **Wallet Intelligence** | "What does RNWY know about the operator wallet itself?" | [RNWY](https://rnwy.com) (`rnwy-wallet-v1`, signalDepth + riskIntensity quadrant) | ES256 |
| **Job Performance** | "Has this agent delivered before?" | [Maiat](https://app.maiat.io) | ES256 |
| **Passport Grade** | "How deeply is this agent's identity verified?" | [APS](https://github.com/aeoess/agent-passport-system) | EdDSA |
| **Trust Verification** | "How reliable is this agent's behavior?" | [AgentID](https://getagentid.dev) | EdDSA |
| **Security Posture** | "Is this agent's code secure?" | [AgentGraph](https://agentgraph.co) | EdDSA |
| **Settlement Witness** | "Was the task actually delivered?" | [SAR](https://defaultverifier.com) | EdDSA |

Each attestation is independently signed and verifiable offline via JWKS. No shared keys, no shared infrastructure.

### Add Your Attestation (Issuer #10+)

The envelope is open. If you sign a distinct dimension of agent or wallet trust, you can join the verification pass. Nine issuers live today; the reference verifier loads any number.

**Checklist (Harold/AgentID pattern, verified in ~30 min):**

1. **JWKS endpoint** at a stable HTTPS URL, RFC 7517 compliant (`kid`, `kty`, `crv`/`alg`, public key material).
2. **Sample JWT** posted on [issues/1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1) with all claims documented.
3. **Signature algorithm** declared — ES256 or EdDSA preferred (reference verifier supports both).
4. **One-line dimension** — the question your attestation answers (e.g. "What does this wallet hold?").

Post your JWKS URL + sample JWT on [issues/1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1) and tag @douglasborthwick-crypto. We run the verifier against your live signature, flag any issues, and add you to the spec + reference verifier on pass. No fee, no contract, no shared keys. Each issuer stays independent.

**Who uses this:**
- **Agent commerce** (x402, ERC-8183) — verify wallet + reasoning + behavior before an agent spends money
- **DeFi lending** — wallet state + behavioral trust + sybil analysis before extending credit
- **Autonomous agent platforms** — multi-dimensional trust check before high-stakes tool calls

| File | Description |
|------|-------------|
| [wallet-resolve.js](wallet-resolve.js) | Multi-attestation fetcher — calls InsumerAPI first (wallet-state foundation layer), then fans out to all configured providers in parallel; outputs a standard multi-attestation envelope compatible with `multi-attest-verify.js` |
| [multi-attest-verify.js](multi-attest-verify.js) | Verifies signatures from 10 signed dimensions across 9 independent issuers (ES256 + EdDSA) |
| [thoughtproof-verify-example.js](thoughtproof-verify-example.js) | ThoughtProof attestation walkthrough — JWKS fetch, EdDSA key import, live wallet-bound signature verification (`/v1/issuer/wallet/{wallet}`) |
| [x402-sar-integration.js](x402-sar-integration.js) | x402 SAR integration — attestation → payment → delivery proof → offline verification |
| [x402-sar-integration-settlementwitness.js](x402-sar-integration-settlementwitness.js) | SettlementWitness SAR integration — live endpoint, Ed25519 verification ([nutstrut](https://github.com/nutstrut)) |

Spec: [MULTI-ATTESTATION-SPEC.md](./MULTI-ATTESTATION-SPEC.md) | Blog: [Would You Trust Your Agent? KYA Is Real.](https://insumermodel.com/blog/multi-attestation-spec-five-shipped-wallet-binding.html) · [Multi-Issuer Verification (predecessor)](https://insumermodel.com/blog/multi-attestation-four-issuers-one-verification-pass.html) | Discussion: [insumer-examples#1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1)

---

## Agent-to-Agent Sessions (AgentTalk)

A SCIF for AI agents. Every agent in the room verifies the same on-chain conditions before information moves — like verifying clearance before entering a secure facility. Bilateral sessions, working groups, or town halls. No artificial cap on participants. Up to 10 composable conditions per channel across any mix of 37 chains.

```json
{
  "conditions": [
    { "type": "token_balance", "chainId": 1, "threshold": 1000000, "label": "USDC >= $1M on Ethereum" },
    { "type": "token_balance", "chainId": 137, "threshold": 500000, "label": "USDC >= $500K on Polygon" },
    { "type": "nft_ownership", "chainId": 1, "label": "Series 7 attestation NFT" },
    { "type": "nft_ownership", "chainId": 1, "label": "KYC credential" },
    { "type": "nft_ownership", "chainId": 8453, "label": "NDA attestation on Base" },
    { "type": "eas_attestation", "label": "Accredited investor (EAS)" }
  ],
  "capacity": 10,
  "autoStart": true
}
```

Six conditions, three chains, every agent in the room, all must pass. But this is one configuration — not the ceiling. One condition on one chain, or ten spanning all 37. Two agents or two hundred. The strength of the lock and the size of the room are at the creator's discretion.

Dynamic enforcement — lose a credential, get ejected on re-verify. Creator can kick. Agents can leave.

```bash
node agenttalk-example.js                # bilateral (2 agents)
node agenttalk-example.js multiparty     # multi-party (3 agents, kick, leave)
```

The flow:
1. **Declare** — Creator opens a channel with conditions + capacity. `autoStart: true` makes it live immediately.
2. **Join** — Agents submit wallets. Each is attested on entry via InsumerAPI.
3. **Attest** — Every wallet verified — each agent gets an ECDSA-signed JWT.
4. **Session** — `sessionId` + `conditionsHash` bind all attestations together.
5. **Enforce** — Re-verify ejects agents who lose credentials. Creator can kick (`/kick`). Agents can leave (`/leave`).

**Built for regulated industries:**
- **Finance & Banking** — syndication rooms, counterparty qualification, collateral verification before term sheets
- **Legal** — privileged communication, M&A data rooms, expert network compliance
- **Intelligence & Defense** — multi-agency briefing rooms, clearance-equivalent credentials, ITAR compliance
- **Healthcare** — HIPAA-qualified data exchange, multi-site clinical trial coordination

| File | Description |
|------|-------------|
| [agenttalk-example.js](agenttalk-example.js) | Bilateral + multi-party flows: declare → join → verify → kick → leave |

AgentTalk is a [SkyeMeta](https://skyemeta.com) product, powered by InsumerAPI. | API: `https://skyemeta.com/api/agenttalk/` | Docs: [skyemeta.com/agenttalk](https://skyemeta.com/agenttalk/)

## Links

- [Developer docs](https://insumermodel.com/developers/)
- [API reference](https://insumermodel.com/developers/api-reference/)
- [OpenAPI 3.1 spec](https://insumermodel.com/openapi.yaml)
- [llms.txt](https://insumermodel.com/llms.txt)

## License

MIT
