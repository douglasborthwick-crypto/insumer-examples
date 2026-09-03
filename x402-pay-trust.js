/**
 * InsumerAPI x402 Pay-Per-Call — trust + trust/batch
 *
 * Same pay-per-call flow as x402-pay-per-call.js (which this reuses), pointed
 * at the two trust endpoints: one $0.15 settlement against POST /v1/trust and
 * one $0.15 (1 wallet) against POST /v1/trust/batch. A settlement is what
 * registers a resource with the CDP Bazaar crawler, so one paid call per
 * endpoint is the fastest route to a catalog listing.
 *
 * Usage:
 *   DEMO_PRIVATE_KEY=0x... node x402-pay-trust.js
 *
 * Needs $0.30 USDC on Base (the default network) for both calls; if the balance only covers the
 * first, the second is skipped with a clear message rather than a cryptic
 * facilitator decline.
 */

const { privateKeyToAccount } = require("viem/accounts");
const { payPerCall } = require("./x402-pay-per-call.js");
const { createPublicClient, http } = require("viem");
const { base } = require("viem/chains");

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// A wallet with visible on-chain life, so the profile has something to say.
const SUBJECT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

async function usdcBalance(payer) {
  const pub = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
  return pub.readContract({
    address: USDC,
    abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }],
    functionName: "balanceOf",
    args: [payer],
  });
}

function report(label, result) {
  if (result.status === 200 && result.body.ok) {
    console.log(`  ${label}: settled — HTTP 200`);
    if (result.settlement) console.log(`  Settlement tx: ${result.settlement.transaction}`);
    const kid = result.body.data && result.body.data.kid;
    if (kid) console.log(`  Signed with kid ${kid}`);
  } else {
    const msg = (result.body && result.body.error) || result.body;
    console.log(`  ${label}: NOT settled (HTTP ${result.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg).slice(0, 200)}`);
  }
}

async function main() {
  const key = process.env.DEMO_PRIVATE_KEY;
  if (!key) {
    console.log("Set DEMO_PRIVATE_KEY — these calls cost real USDC ($0.15 each).");
    process.exit(1);
  }
  const payer = privateKeyToAccount(key).address;
  const startBal = await usdcBalance(payer);
  console.log(`Payer: ${payer}`);
  console.log(`USDC balance: ${(Number(startBal) / 1e6).toFixed(6)}\n`);

  // ── 1. POST /v1/trust — $0.15 ──
  console.log("POST /v1/trust ($0.15)…");
  const trust = await payPerCall("/v1/trust", { wallet: SUBJECT }, key);
  report("trust", trust);

  // ── 2. POST /v1/trust/batch — $0.15 for one wallet ──
  const midBal = await usdcBalance(payer);
  if (midBal < 150000n) {
    console.log(`\nSkipping /v1/trust/batch: balance ${(Number(midBal) / 1e6).toFixed(6)} is below $0.15.`);
    console.log(`Top up USDC on Base (the network this example pays on) to ${payer} and re-run — the trust settlement above still counts.`);
    return;
  }
  console.log("\nPOST /v1/trust/batch ($0.15, one wallet)…");
  const batch = await payPerCall("/v1/trust/batch", { wallets: [{ wallet: SUBJECT }] }, key);
  report("trust/batch", batch);

  const endBal = await usdcBalance(payer);
  console.log(`\nRemaining USDC: ${(Number(endBal) / 1e6).toFixed(6)}`);
  console.log("Bazaar crawler watch: both endpoints already pass CDP validate; a settled");
  console.log("call per endpoint is the registration signal. Listing typically follows within the hour.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
