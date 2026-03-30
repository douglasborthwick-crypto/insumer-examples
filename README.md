# InsumerAPI Examples

Condition-based access infrastructure for 33 blockchains. Send a wallet and conditions, get a signed boolean. No secrets, no identity, no static credentials.

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
- **Multiple conditions**: Up to 10 conditions per call, across any mix of 33 chains
- **Cross-chain**: Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BNB Chain, Solana, XRPL, Bitcoin, and 23 more
- **Trust profiles**: 40-check composite trust score across 24 chains (`POST /v1/trust`)

Every response is signed with ECDSA P-256. Pass the wallet auth result to downstream systems as cryptographic proof without re-querying the chain.

## Examples

| File | Language | What it does |
|------|----------|-------------|
| [quickstart.sh](quickstart.sh) | Bash | Generates a key and runs a wallet auth check — zero setup |
| [verify.js](verify.js) | Node.js | Express server with wallet auth for token-gated discounts |
| [verify.py](verify.py) | Python | On-chain verification with signature handling |
| [verify-xrpl.js](verify-xrpl.js) | Node.js | XRPL: XRP, RLUSD, USDC trust lines, NFTs, trust profiles |

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

## Supported Chains (33)

**EVM (30):** Ethereum (1), BNB Chain (56), Base (8453), Avalanche (43114), Polygon (137), Arbitrum (42161), Optimism (10), Chiliz (88888), Soneium (1868), Plume (98866), Sonic (146), Gnosis (100), Mantle (5000), Scroll (534352), Linea (59144), zkSync Era (324), Blast (81457), Taiko (167000), Ronin (2020), Celo (42220), Moonbeam (1284), Moonriver (1285), Viction (88), opBNB (204), World Chain (480), Unichain (130), Ink (57073), Sei (1329), Berachain (80094), ApeChain (33139)

**Non-EVM:** Solana (`chainId: "solana"`), XRPL (`chainId: "xrpl"` — native XRP, trust line tokens, NFTs), Bitcoin (`bitcoinWallet` — native BTC, P2PKH/P2SH/bech32/Taproot)

## Pricing

| Tier | Daily Reads | Credits | Price |
|------|-------------|---------|-------|
| Free | 100/day | 10 | $0 |
| Pro | 10,000/day | 1,000/mo | $29/mo |
| Enterprise | 100,000/day | 5,000/mo | $99/mo |

[Full pricing →](https://insumermodel.com/pricing/)

---

## Multi-Attestation Verification

Before an AI agent transacts with another agent, a relying party can verify four independent dimensions in a single pass:

| Dimension | Question Answered | Issuer | Algorithm |
|-----------|-------------------|--------|-----------|
| **Wallet State** | Privacy-preserving on-chain verification — signed booleans across 33 chains, no balances exposed | [InsumerAPI](https://insumermodel.com) | ES256 (P-256) |
| **Reasoning Integrity** | Adversarial verification of AI agent reasoning chains — challenging claims before agents act | [ThoughtProof](https://thoughtproof.ai) | EdDSA (Ed25519) |
| **Behavioral Trust** | Transparent trust scores for crypto wallets and AI agents — sybil detection and reputation tracking | [RNWY](https://rnwy.com) | ES256 (P-256) |
| **Job Performance** | Trust layer for AI agents — verifying job completion, deliverable quality, and agent reliability | [Maiat](https://app.maiat.io) | ES256 (P-256) |

Each attestation is independently signed by its issuer and verifiable offline via its published JWKS endpoint. No shared keys, no shared infrastructure, no callbacks to the issuer at verification time.

| File | Description |
|------|-------------|
| [multi-attest-verify.js](multi-attest-verify.js) | Verifies signatures from 4 independent issuers (ES256 + EdDSA) |
| [thoughtproof-verify-example.js](thoughtproof-verify-example.js) | ThoughtProof attestation walkthrough — JWKS fetch, EdDSA key import |
| [x402-sar-integration.js](x402-sar-integration.js) | x402 SAR integration — attestation → payment → delivery proof → offline verification |
| [x402-sar-integration-settlementwitness.js](x402-sar-integration-settlementwitness.js) | SettlementWitness SAR integration — live endpoint, Ed25519 verification ([nutstrut](https://github.com/nutstrut)) |

Spec: [MULTI-ATTESTATION-SPEC.md](./MULTI-ATTESTATION-SPEC.md) | Blog: [Four Issuers, One Verification Pass](https://insumermodel.com/blog/multi-attestation-four-issuers-one-verification-pass.html) | Discussion: [insumer-examples#1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1)

## Links

- [Developer docs](https://insumermodel.com/developers/)
- [API reference](https://insumermodel.com/developers/api-reference/)
- [OpenAPI 3.1 spec](https://insumermodel.com/openapi.yaml)
- [llms.txt](https://insumermodel.com/llms.txt)

## License

MIT
