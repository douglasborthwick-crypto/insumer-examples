# InsumerAPI Examples

Code examples for [InsumerAPI](https://insumermodel.com/developers/) — privacy-preserving on-chain verification across 32 blockchains.

An **insumer** is a portmanteau of Investor and Consumer. InsumerAPI verifies token balances and NFT ownership and returns ECDSA-signed boolean results (met/not met). No raw balances exposed.

## Quick Start

Get a free API key (10 verification credits, 100 daily reads):

```bash
curl -X POST \
  https://api.insumermodel.com/v1/keys/create \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "appName": "my-app", "tier": "free"}'
```

Then verify a wallet in one call:

```bash
curl -X POST \
  https://api.insumermodel.com/v1/attest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: insr_live_your_key_here" \
  -d '{
    "wallet": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "conditions": [
      {
        "type": "token_balance",
        "contractAddress": "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
        "chainId": 1,
        "threshold": 1000000,
        "label": "SHIB holder"
      }
    ]
  }'
```

Response:

```json
{
  "ok": true,
  "data": {
    "attestation": {
      "id": "ATST-1A2B3C4D5E6F7890",
      "pass": true,
      "results": [{ "condition": 0, "label": "SHIB holder", "met": true }],
      "passCount": 1,
      "failCount": 0,
      "attestedAt": "2026-02-28T12:34:57.000Z",
      "expiresAt": "2026-02-28T13:04:57.000Z"
    },
    "sig": "MEUCIQDf8...",
    "kid": "insumer-attest-v1"
  },
  "meta": { "creditsCharged": 1, "creditsRemaining": 9, "version": "1.0", "timestamp": "..." }
}
```

### XRPL verification

Verify native XRP balance:

```bash
curl -X POST \
  https://api.insumermodel.com/v1/attest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: insr_live_your_key_here" \
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

Verify RLUSD trust line token:

```bash
curl -X POST \
  https://api.insumermodel.com/v1/attest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: insr_live_your_key_here" \
  -d '{
    "xrplWallet": "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn",
    "conditions": [
      {
        "type": "token_balance",
        "contractAddress": "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
        "chainId": "xrpl",
        "currency": "RLUSD",
        "threshold": 10,
        "label": "RLUSD >= 10 on XRPL"
      }
    ]
  }'
```

## Examples

| File | Language | Description |
|------|----------|-------------|
| [quickstart.sh](quickstart.sh) | Bash/curl | Get a key and verify a wallet in two commands |
| [verify.js](verify.js) | Node.js | Token-gated Express server with discount checking |
| [verify.py](verify.py) | Python | On-chain verification with signature handling |
| [verify-xrpl.js](verify-xrpl.js) | Node.js | XRPL-focused: XRP, RLUSD, USDC trust lines, NFTs, trust profiles |
| [multi-attest-verify.js](multi-attest-verify.js) | Node.js | Multi-attestation verifier — verifies signatures from 4 independent issuers (ES256 + EdDSA) |

## Multi-Attestation Verification

Before an AI agent transacts with another agent, a relying party can verify four independent dimensions in a single pass:

| Dimension | Question Answered | Issuer | Algorithm |
|-----------|-------------------|--------|-----------|
| **Wallet State** | Privacy-preserving on-chain verification — signed booleans across 32 chains, no balances exposed | [InsumerAPI](https://insumermodel.com) | ES256 (P-256) |
| **Reasoning Integrity** | Adversarial verification of AI agent reasoning chains — challenging claims before agents act | [ThoughtProof](https://thoughtproof.ai) | EdDSA (Ed25519) |
| **Behavioral Trust** | Transparent trust scores for crypto wallets and AI agents — sybil detection and reputation tracking | [RNWY](https://rnwy.com) | ES256 (P-256) |
| **Job Performance** | Trust layer for AI agents — verifying job completion, deliverable quality, and agent reliability | [Maiat](https://app.maiat.io) | ES256 (P-256) |

Each attestation is independently signed by its issuer and verifiable offline via its published JWKS endpoint. No shared keys, no shared infrastructure, no callbacks to the issuer at verification time.

The [`multi-attest-verify.js`](multi-attest-verify.js) reference implementation accepts an array of attestations and verifies whichever dimensions the relying party requires:

```javascript
const { verifyMultiAttestation } = require('./multi-attest-verify');

const result = await verifyMultiAttestation(payload, {
  requiredTypes: ['wallet_state', 'behavioral_trust']
});

if (result.valid) {
  // Required attestation types present, signatures verified, not expired
}
```

A low-value transaction might require only wallet state verification. A high-value contract might require all four dimensions. The relying party decides — not the issuers.

Spec discussion: [Multi-Attestation Payload Format](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1)

## What You Can Verify

- **Token balances**: Does this wallet hold at least X of token Y on chain Z?
- **NFT ownership**: Does this wallet own an NFT from collection Y on chain Z?
- **Multiple conditions**: Up to 10 conditions per call, across any mix of 32 chains
- **Cross-chain**: Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BNB Chain, Solana, XRPL, and 23 more

Every response is signed with ECDSA P-256. Pass the signature to downstream systems as cryptographic proof without re-querying the chain.

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

## Use Cases

- **Token-gated access**: Gate APIs, content, or features behind token ownership
- **Agent-to-agent trust**: One agent verifies, another checks the ECDSA signature offline
- **DAO eligibility**: Confirm governance token holdings for voting without exposing portfolio size
- **Creditworthiness**: Check minimum balance requirements for DeFi or lending
- **NFT verification**: Verify collection ownership for Discord bots, games, or community platforms
- **Holder rewards**: Assign discount tiers based on verified holdings

## Supported Chains (32)

**EVM (30):** Ethereum (1), BNB Chain (56), Base (8453), Avalanche (43114), Polygon (137), Arbitrum (42161), Optimism (10), Chiliz (88888), Soneium (1868), Plume (98866), Sonic (146), Gnosis (100), Mantle (5000), Scroll (534352), Linea (59144), zkSync Era (324), Blast (81457), Taiko (167000), Ronin (2020), Celo (42220), Moonbeam (1284), Moonriver (1285), Viction (88), opBNB (204), World Chain (480), Unichain (130), Ink (57073), Sei (1329), Berachain (80094), ApeChain (33139)

**Non-EVM:** Solana (use `chainId: "solana"`), XRPL (use `chainId: "xrpl"` — native XRP, trust line tokens, NFTs)

## Agent SDKs

- **MCP Server** (Claude, Cursor, Windsurf): `npx -y mcp-server-insumer` — [npm](https://www.npmjs.com/package/mcp-server-insumer)
- **LangChain** (Python agents): `pip install langchain-insumer` — [PyPI](https://pypi.org/project/langchain-insumer/)
- **GPT Actions**: Import the [OpenAPI spec](https://insumermodel.com/openapi.yaml) into any Custom GPT

## Pricing

| Tier | Daily Reads | Credits | Price |
|------|-------------|---------|-------|
| Free | 100/day | 10 | $0 |
| Pro | 10,000/day | 100 | $9/mo |
| Enterprise | 100,000/day | 500 | $29/mo |

**USDC volume discounts:** $5–$99 = $0.04/call (25 credits/$1) · $100–$499 = $0.03 (33/$1, 25% off) · $500+ = $0.02 (50/$1, 50% off)

**Platform wallets (USDC only):**
- **EVM:** `0xAd982CB19aCCa2923Df8F687C0614a7700255a23`
- **Solana:** `6a1mLjefhvSJX1sEX8PTnionbE9DqoYjU6F6bNkT4Ydr`

**Supported USDC chains:** Ethereum, Base, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche, Solana. USDC sent on unsupported chains cannot be recovered. All purchases are final and non-refundable. [Full pricing →](https://insumermodel.com/pricing/)

## Links

- [AI Agent Verification API guide](https://insumermodel.com/ai-agent-verification-api/)
- [Developer docs](https://insumermodel.com/developers/)
- [OpenAPI 3.1 spec](https://insumermodel.com/openapi.yaml)
- [llms.txt](https://insumermodel.com/llms.txt)
- [Full API reference](https://insumermodel.com/llms-full.txt)

## License

MIT
