/**
 * InsumerAPI x402 Pay-Per-Call — client example
 *
 * Call POST /v1/attest with NO API key and no signup: the API answers with an
 * x402 402 quote listing one accept per settlement network (USDC on Base,
 * Polygon, Arbitrum, or Solana), you sign an EIP-3009 USDC authorization on
 * the EVM network you choose, retry with the PAYMENT-SIGNATURE header, and get
 * back a signed attestation. Gasless for the payer — the settlement
 * transaction is submitted by the facilitator, not you. (For Solana, use the
 * official @x402/fetch client with @x402/svm; this hand-rolled example covers
 * the EVM networks.)
 *
 * This is the mirror image of x402-condition-gate.js: there, InsumerAPI gates
 * YOUR x402 endpoint; here, x402 pays INSUMERAPI. Same protocol, same USDC
 * domain, opposite direction.
 *
 * The flow:
 *   1. POST /v1/attest with no credential headers → 402 + quote (JSON body).
 *      The quote's `accepts` lists one entry per settlement network, Base
 *      first, all at the same amount (priced for the body you sent, so a
 *      proof:"merkle" body is quoted at double). Pick a network; this example
 *      takes the first EVM entry (Base) unless X402_NETWORK names another,
 *      e.g. X402_NETWORK=eip155:137 for Polygon.
 *   2. Sign TransferWithAuthorization (EIP-3009) for EXACTLY the quoted
 *      amount under that entry's EIP-712 domain — overpayment is rejected,
 *      not kept.
 *   3. Retry with PAYMENT-SIGNATURE: base64 of the x402 v2 PaymentPayload.
 *      (The v1 header name X-PAYMENT is still accepted.)
 *   4. 200 → signed attestation + a PAYMENT-RESPONSE header (also sent as
 *      X-PAYMENT-RESPONSE) carrying the settlement transaction hash. Verify
 *      the attestation offline via JWKS.
 *
 * Notes that save debugging time:
 *   - Pay-per-call attest is capped at 2 conditions per request. Larger
 *     requests need an API key.
 *   - `validBefore` may be at most 10 minutes out; the quote's
 *     maxTimeoutSeconds (60s) is a safe window.
 *   - The authorization nonce is single-use per payer. A replay with the same
 *     nonce is rejected even before settlement.
 *
 * Usage:
 *   npm install viem
 *   DEMO_PRIVATE_KEY=0x... node x402-pay-per-call.js
 *
 * Run without DEMO_PRIVATE_KEY and it generates a throwaway keypair: the
 * quote, signature, and submission all work end-to-end, but settlement
 * honestly declines — an empty wallet holds no USDC. Fund a wallet with a few
 * cents of USDC on the chosen network (this demo costs $0.05) and pass its key to see a
 * real settlement. The key is read only at runtime and never committed.
 */

const { createPublicClient, http } = require("viem");
const { base, polygon, arbitrum } = require("viem/chains");
const { privateKeyToAccount, generatePrivateKey } = require("viem/accounts");

const API = "https://api.insumermodel.com";

/**
 * Read the payer's USDC balance on the quoted network (public RPC, no key).
 * Purely a preflight nicety: the facilitator reports an unfunded authorization
 * as `invalid_payload` (the transfer simulation reverts), which is cryptic —
 * checking first gives a clear message instead.
 * @param {string} network - CAIP-2 network from the quote, e.g. "eip155:8453"
 * @param {string} usdcAddress - the USDC contract from the quote
 * @param {string} payer - the paying wallet address
 * @returns {Promise<bigint>} balance in atomic units (6 decimals)
 */
async function usdcBalance(network, usdcAddress, payer) {
  const rpc = {
    "eip155:8453": { chain: base, url: "https://mainnet.base.org" },
    "eip155:137": { chain: polygon, url: "https://polygon-rpc.com" },
    "eip155:42161": { chain: arbitrum, url: "https://arb1.arbitrum.io/rpc" },
  }[network];
  if (!rpc) return null;
  const pub = createPublicClient({ chain: rpc.chain, transport: http(rpc.url) });
  return pub.readContract({
    address: usdcAddress,
    abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }],
    functionName: "balanceOf",
    args: [payer],
  });
}

// ─── EIP-3009 TransferWithAuthorization typed-data ───
// The domain values (name/version) come from the quote itself (extra.name,
// extra.version) so the client always signs the domain settlement enforces.
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

/**
 * Pick the quote variant matching this request. buildAccepts quotes standard
 * first and proof:"merkle" second; amounts differ, so sort by amount and take
 * the cheap one unless the body asks for a Merkle proof.
 * @param {object[]} accepts - the 402 quote's accepts array
 * @param {object} body - the request body being paid for
 * @returns {object} the chosen PaymentRequirements
 */
function chooseRequirement(accepts, body) {
  // One entry per network, same amount for this body. Take the network named
  // by X402_NETWORK (CAIP-2, e.g. eip155:137) or the first EVM entry (Base).
  const want = process.env.X402_NETWORK;
  const evm = accepts.filter((a) => a.network.startsWith("eip155:"));
  const pick = want ? evm.find((a) => a.network === want) : evm[0];
  if (!pick) throw new Error(`No EVM accept for ${want || "any network"} in quote: ${accepts.map((a) => a.network).join(", ")}`);
  return pick;
}

/**
 * Call an InsumerAPI x402-enabled endpoint, paying per call in USDC on one of
 * the quoted EVM networks (Base by default).
 * @param {string} path - endpoint path, e.g. "/v1/attest"
 * @param {object} body - the request body
 * @param {string} privateKey - hex private key of the paying wallet
 * @returns {Promise<{status: number, body: object, settlement: object|null, quote: object|null}>}
 */
async function payPerCall(path, body, privateKey) {
  const account = privateKeyToAccount(privateKey);
  const url = `${API}${path}`;
  const json = { "Content-Type": "application/json" };

  // Step 1: no credentials → 402 quote.
  const quoteRes = await fetch(url, { method: "POST", headers: json, body: JSON.stringify(body) });
  if (quoteRes.status !== 402) {
    return { status: quoteRes.status, body: await quoteRes.json(), settlement: null, quote: null };
  }
  const quote = await quoteRes.json();
  const req = chooseRequirement(quote.accepts, body);
  const chainId = Number(req.network.split(":")[1]); // CAIP-2, e.g. "eip155:8453"

  // Step 2: sign the authorization for exactly the quoted amount.
  const nowSec = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address,
    to: req.payTo,
    value: req.amount,
    validAfter: "0",
    validBefore: String(nowSec + 120),
    nonce: `0x${require("crypto").randomBytes(32).toString("hex")}`,
  };
  const signature = await account.signTypedData({
    domain: {
      name: req.extra.name,
      version: req.extra.version,
      chainId,
      verifyingContract: req.asset,
    },
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });

  // Step 3: retry with the x402 v2 PaymentPayload in PAYMENT-SIGNATURE.
  const paymentPayload = {
    x402Version: 2,
    resource: { url, method: "POST" },
    accepted: req,
    payload: { signature, authorization },
  };
  const paidRes = await fetch(url, {
    method: "POST",
    headers: { ...json, "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(paymentPayload)).toString("base64") },
    body: JSON.stringify(body),
  });

  // Step 4: on success the settlement receipt rides in PAYMENT-RESPONSE
  // (and, for older clients, X-PAYMENT-RESPONSE — identical contents).
  let settlement = null;
  const receiptHeader = paidRes.headers.get("PAYMENT-RESPONSE") || paidRes.headers.get("X-PAYMENT-RESPONSE");
  if (receiptHeader) {
    try {
      settlement = JSON.parse(Buffer.from(receiptHeader, "base64").toString("utf8"));
    } catch {
      settlement = null;
    }
  }
  return { status: paidRes.status, body: await paidRes.json(), settlement, quote: req };
}

// ─── Demo: one condition, $0.05, no key anywhere ───
async function main() {
  const key = process.env.DEMO_PRIVATE_KEY || generatePrivateKey();
  const payer = privateKeyToAccount(key).address;
  if (!process.env.DEMO_PRIVATE_KEY) {
    console.log("No DEMO_PRIVATE_KEY set — using a throwaway keypair.");
    console.log("The full quote → sign → submit flow runs, but settlement will");
    console.log("honestly decline: an empty wallet holds no USDC.\n");
  }
  console.log(`Payer: ${payer}`);

  const body = {
    wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    conditions: [
      {
        type: "token_balance",
        contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        chainId: 8453,
        threshold: "1",
        label: "Holds USDC on Base",
      },
    ],
  };

  const result = await payPerCall("/v1/attest", body, key);
  if (result.quote) {
    const usd = Number(result.quote.amount) / 1e6;
    console.log(`Quoted: $${usd.toFixed(2)} USDC on ${result.quote.network} → ${result.quote.payTo}`);
    try {
      const bal = await usdcBalance(result.quote.network, result.quote.asset, payer);
      if (bal !== null) console.log(`Payer USDC balance: ${(Number(bal) / 1e6).toFixed(6)}`);
    } catch {
      console.log("Payer USDC balance: (public RPC unavailable — the settlement result below is what counts)");
    }
    if (bal < BigInt(result.quote.amount)) {
      console.log("Balance is below the quoted price — settlement will decline.");
    }
  }

  if (result.status === 200 && result.body.ok) {
    const { attestation, sig, kid } = result.body.data;
    console.log(`\nPASS: ${attestation.pass} (attestation ${attestation.id})`);
    for (const r of attestation.results) {
      console.log(`  [${r.met ? "MET" : "NOT MET"}] ${r.label || r.type}`);
    }
    console.log(`Signed with kid ${kid} — verify offline via ${API}/v1/jwks`);
    console.log(`sig: ${sig.slice(0, 44)}…`);
    if (result.settlement) {
      console.log(`Settlement tx: ${result.settlement.transaction} (payer ${result.settlement.payer})`);
    }
  } else {
    const msg = (result.body && result.body.error) || result.body;
    console.log(`\nNot settled (HTTP ${result.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
    console.log("(An unfunded wallet's authorization is reported as invalid_payload —");
    console.log("the facilitator's transfer simulation reverts on a zero balance.)");
    console.log("Fund the payer wallet with USDC on the quoted network and re-run to see a real settlement.");
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { payPerCall, chooseRequirement, EIP3009_TYPES };
