/**
 * InsumerAPI + x402 SAR Integration Example
 *
 * End-to-end flow: attestation → payment → SAR receipt → offline verification
 *
 * This example demonstrates how a pre-transaction wallet attestation (InsumerAPI)
 * composes with a post-transaction delivery proof (SAR) in the x402 ecosystem.
 * A consistent agent_id threads through all four steps.
 *
 * Steps 1 & 4 are fully runnable against InsumerAPI.
 * Steps 2 & 3 are stubs showing the SAR interface — fill in with your SAR
 * implementation (see github.com/coinbase/x402/issues/1195).
 *
 * Usage:
 *   npm install insumer-verify jose
 *   INSUMER_API_KEY=insr_live_... node x402-sar-integration.js
 *
 * Get a free API key:
 *   curl -s -X POST https://api.insumermodel.com/v1/keys/create \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"you@example.com","appName":"SAR Integration","tier":"free"}'
 */

const { verify } = require("insumer-verify");
const { createRemoteJWKSet, jwtVerify } = require("jose");

const API = "https://api.insumermodel.com";
const KEY = process.env.INSUMER_API_KEY;

if (!KEY) {
  console.error("Set INSUMER_API_KEY environment variable");
  process.exit(1);
}

// Consistent identity across all four steps
const AGENT_ID = `agent-${Date.now()}`;

// Example: verify counterparty holds USDC on Base before transacting
const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // vitalik.eth (demo)
const CONDITIONS = [
  {
    type: "token_balance",
    contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    chainId: 8453,
    threshold: 1,
    label: "USDC on Base",
  },
];

async function main() {
  console.log(`Agent: ${AGENT_ID}\n`);

  // ─── Step 1: Pre-transaction attestation (InsumerAPI) ───
  console.log("Step 1: Pre-transaction attestation");
  console.log("  Verifying counterparty wallet meets conditions...\n");

  const attestRes = await fetch(`${API}/v1/attest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: JSON.stringify({
      wallet: WALLET,
      conditions: CONDITIONS,
      format: "jwt",
    }),
  });

  const attestResult = await attestRes.json();

  if (!attestResult.ok) {
    console.error("Attestation failed:", attestResult.error);
    process.exit(1);
  }

  const { attestation, sig, kid, jwt } = attestResult.data;

  console.log(`  Attestation ID: ${attestation.id}`);
  console.log(`  Pass: ${attestation.pass}`);
  console.log(`  Results:`);
  attestation.results.forEach((r) => {
    console.log(`    [${r.met ? "MET" : "NOT MET"}] ${r.label} (chain ${r.chainId})`);
  });
  console.log(`  Signature: ${sig.substring(0, 20)}...`);
  console.log(`  JWT: ${jwt.substring(0, 40)}...`);
  console.log(`  Agent: ${AGENT_ID}\n`);

  // ─── Step 2: x402 payment (your implementation) ───
  console.log("Step 2: x402 payment");
  console.log("  [Stub] Execute x402 payment flow here.");
  console.log("  The attestation from Step 1 tells the agent whether to proceed.");
  console.log(`  Thread agent_id: ${AGENT_ID} through the payment request.\n`);

  // In production, this is where you'd call the x402 facilitator.
  // The attestation result (pass/fail) informs the agent's decision
  // to initiate payment. The agent_id links this payment to the
  // pre-transaction attestation.
  const paymentTxHash = "0x_simulated_payment_hash";

  // ─── Step 3: SAR receipt (your implementation) ───
  console.log("Step 3: SAR receipt");
  console.log("  [Stub] SAR receipt issued after delivery verification.");
  console.log(`  Thread agent_id: ${AGENT_ID} into the SAR receipt.\n`);

  // In production, the SAR verifier issues an Ed25519-signed receipt
  // with verdict PASS | FAIL | INDETERMINATE. The receipt includes
  // agent_id, linking it to the attestation and payment.
  //
  // Expected SAR receipt shape (from SAR v0.1 spec):
  // {
  //   receipt_id: "...",
  //   agent_id: AGENT_ID,
  //   verdict: "PASS",
  //   confidence: 0.95,
  //   reason_code: "DELIVERY_CONFIRMED",
  //   timestamp: "...",
  //   signature: "..."  // Ed25519
  // }
  const sarReceipt = {
    receipt_id: "sar-simulated",
    agent_id: AGENT_ID,
    verdict: "PASS",
    confidence: 0.95,
    reason_code: "DELIVERY_CONFIRMED",
  };

  // ─── Step 4: Offline verification of both artifacts ───
  console.log("Step 4: Offline verification\n");

  // 4a. Verify InsumerAPI attestation (ECDSA P-256 via insumer-verify)
  console.log("  4a. Verifying InsumerAPI attestation...");
  try {
    const attestVerify = await verify(attestResult.data);
    console.log(`      Valid: ${attestVerify.valid}`);
    if (!attestVerify.valid) {
      console.log(`      Reason: ${attestVerify.reason}`);
    }
  } catch (err) {
    console.log(`      Error: ${err.message}`);
  }

  // 4b. Verify JWT independently (standard ES256 via JWKS)
  console.log("  4b. Verifying JWT via JWKS...");
  try {
    const JWKS = createRemoteJWKSet(new URL(`${API}/v1/jwks`));
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer: "https://api.insumermodel.com",
      algorithms: ["ES256"],
    });
    console.log(`      JWT valid. Subject: ${payload.sub}, Pass: ${payload.pass}`);
  } catch (err) {
    console.log(`      JWT verification error: ${err.message}`);
  }

  // 4c. Verify SAR receipt (Ed25519 — use SAR verifier)
  console.log("  4c. SAR receipt verification...");
  console.log("      [Stub] Verify Ed25519 signature via SAR key registry.");
  console.log("      See: https://defaultverifier.com/.well-known/sar-keys.json\n");

  // ─── Summary: agent_id links all artifacts ───
  console.log("─── Artifact Summary ───");
  console.log(`Agent ID:        ${AGENT_ID}`);
  console.log(`Attestation ID:  ${attestation.id}`);
  console.log(`Payment TX:      ${paymentTxHash}`);
  console.log(`SAR Receipt ID:  ${sarReceipt.receipt_id}`);
  console.log(
    "\nAll four artifacts are linked by agent_id and independently"
  );
  console.log("verifiable offline — no callbacks to either issuer required.");
}

main().catch(console.error);
