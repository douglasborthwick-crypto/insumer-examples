/**
 * InsumerAPI x402 Pay-Per-Call — client example
 *
 * Call POST /v1/attest with NO API key and no signup: the API answers with an
 * x402 402 quote, you sign an EIP-3009 USDC authorization on Base, retry with
 * the X-PAYMENT header, and get back a signed attestation. Gasless for the
 * payer — the settlement transaction is submitted by the facilitator, not you.
 *
 * This is the mirror image of x402-condition-gate.js: there, InsumerAPI gates
 * YOUR x402 endpoint; here, x402 pays INSUMERAPI. Same protocol, same USDC
 * domain, opposite direction.
 *
 * The flow:
 *   1. POST /v1/attest with no credential headers → 402 + quote (JSON body).
 *      The quote's `accepts` lists both billing variants: standard, and
 *      proof:"merkle" at double price. Pick the one matching your request.
 *   2. Sign TransferWithAuthorization (EIP-3009) for EXACTLY the quoted
 *      amount — overpayment is rejected, not kept.
 *   3. Retry with X-PAYMENT: base64 of the x402 v2 PaymentPayload.
 *   4. 200 → signed attestation + an X-PAYMENT-RESPONSE header carrying the
 *      settlement transaction hash. Verify the attestation offline via JWKS.
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
 * cents of USDC on Base (this demo costs $0.05) and pass its key to see a
 * real settlement. The key is read only at runtime and never committed.
 */

const { createPublicClient, http } = require("viem");
const { base } = require("viem/chains");
const { privateKeyToAccount, generatePrivateKey } = require("viem/accounts");

const API = "https://api.insumermodel.com";

/**
 * Read the payer's USDC balance on Base (public RPC, no key). Purely a
 * preflight nicety: the facilitator reports an unfunded authorization as
 * `invalid_payload` (the transfer simulation reverts), which is cryptic —
 * checking first gives a clear message instead.
 * @param {string} usdcAddress - the USDC contract from the quote
 * @param {string} payer - the paying wallet address
 * @returns {Promise<bigint>} balance in atomic units (6 decimals)
 */
async function usdcBalance(usdcAddress, payer) {
  const pub = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
  return pub.readContract({
    address: usdcAddress,
    abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }],
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
  const sorted = [...accepts].sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? -1 : 1));
  return body.proof === "merkle" ? sorted[sorted.length - 1] : sorted[0];
}

/**
 * Call an InsumerAPI x402-enabled endpoint, paying per call in USDC on Base.
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

  // Step 3: retry with the x402 v2 PaymentPayload in X-PAYMENT.
  const paymentPayload = {
    x402Version: 2,
    resource: { url, method: "POST" },
    accepted: req,
    payload: { signature, authorization },
  };
  const paidRes = await fetch(url, {
    method: "POST",
    headers: { ...json, "X-PAYMENT": Buffer.from(JSON.stringify(paymentPayload)).toString("base64") },
    body: JSON.stringify(body),
  });

  // Step 4: on success the settlement receipt rides in X-PAYMENT-RESPONSE.
  let settlement = null;
  const receiptHeader = paidRes.headers.get("X-PAYMENT-RESPONSE");
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
    console.log(`Quoted: $${usd.toFixed(2)} USDC on Base → ${result.quote.payTo}`);
    const bal = await usdcBalance(result.quote.asset, payer);
    console.log(`Payer USDC balance: ${(Number(bal) / 1e6).toFixed(6)}`);
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
    console.log("Fund the payer wallet with USDC on Base and re-run to see a real settlement.");
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { payPerCall, chooseRequirement, EIP3009_TYPES };
