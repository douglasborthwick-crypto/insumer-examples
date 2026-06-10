/**
 * Smoke test for x402-condition-gate.js
 *
 * Exercises every path of the reference endpoint against the live InsumerAPI:
 *   1. No payment            → 402 Payment Required
 *   2. Spoofed wallet        → 402 (signature does not authenticate the claim)
 *   3. Authenticated payer   → eligibility checked, served accordingly
 *   4. Primitive both ways   → /v1/attest returns pass:true and pass:false
 *
 * The signed payments are produced with throwaway, ephemeral keys generated at
 * runtime — no real private keys are used or stored.
 *
 * Usage:
 *   npm install express viem
 *   INSUMER_API_KEY=insr_live_... node x402-condition-gate-test.js
 */

const http = require("http");
const { privateKeyToAccount, generatePrivateKey } = require("viem/accounts");
const { app, EIP3009_DOMAIN, EIP3009_TYPES } = require("./x402-condition-gate");

const API = "https://api.insumermodel.com";
const KEY = process.env.INSUMER_API_KEY;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// A well-known public wallet that holds USDC on Base (vitalik.eth), used only
// for the direct primitive check below — never signed for.
const PUBLIC_HOLDER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
// A freshly generated address holds nothing, so it provably fails the condition.
const EMPTY_WALLET = privateKeyToAccount(generatePrivateKey()).address;

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Sign an EIP-3009 transferWithAuthorization and return the x402 payment header. */
async function buildPayment(account, fromOverride) {
  const authorization = {
    from: fromOverride || account.address,
    to: "0x0000000000000000000000000000000000000000",
    value: "10000",
    validAfter: "0",
    validBefore: "99999999999",
    nonce: "0x" + "00".repeat(32),
  };
  const signature = await account.signTypedData({
    domain: EIP3009_DOMAIN,
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
  const payload = { x402Version: 2, accepted: {}, payload: { signature, authorization } };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/** Minimal GET against the local server with an optional X-PAYMENT header. */
function get(server, paymentHeader) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const headers = paymentHeader ? { "X-PAYMENT": paymentHeader } : {};
    http
      .get({ host: "127.0.0.1", port, path: "/premium", headers }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body || "{}") }));
      })
      .on("error", reject);
  });
}

async function attestDirect(wallet) {
  const res = await fetch(`${API}/v1/attest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: JSON.stringify({
      wallet,
      conditions: [
        { type: "token_balance", contractAddress: USDC_BASE, chainId: 8453, threshold: "1", label: "Holds USDC on Base" },
      ],
    }),
  });
  return res.json();
}

async function main() {
  if (!KEY) {
    console.error("Set INSUMER_API_KEY (see quickstart.sh)");
    process.exit(1);
  }

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));

  try {
    // 1. No payment → 402
    const noPay = await get(server);
    check("no payment → 402", noPay.status === 402 && noPay.body.x402Version === 2, `got ${noPay.status}`);

    // 2. Spoofed wallet: ephemeral key signs but claims the public holder's address
    const attacker = privateKeyToAccount(generatePrivateKey());
    const spoof = await buildPayment(attacker, PUBLIC_HOLDER);
    const spoofRes = await get(server, spoof);
    check(
      "spoofed wallet → 402 (signature does not authenticate claim)",
      spoofRes.status === 402 && /did not authenticate/.test(spoofRes.body.error || ""),
      `got ${spoofRes.status}: ${spoofRes.body.error || ""}`
    );

    // 3. Authenticated payer: ephemeral key signs for its own address.
    //    Ephemeral wallet holds no USDC → not eligible → served via paid flow.
    const payer = privateKeyToAccount(generatePrivateKey());
    const authed = await buildPayment(payer);
    const authedRes = await get(server, authed);
    check(
      "authenticated payer → 200, eligibility evaluated",
      authedRes.status === 200 && authedRes.body.eligibility && authedRes.body.eligibility.pass === false,
      `got ${authedRes.status}: ${JSON.stringify(authedRes.body.eligibility)}`
    );
    check(
      "attestation id surfaced to caller",
      typeof (authedRes.body.eligibility && authedRes.body.eligibility.attestationId) === "string",
      JSON.stringify(authedRes.body.eligibility)
    );

    // 4. Primitive both ways (direct /v1/attest)
    const holder = await attestDirect(PUBLIC_HOLDER);
    check("primitive: public holder → pass:true", holder.ok && holder.data.attestation.pass === true, JSON.stringify(holder.error || holder.data?.attestation?.pass));

    const empty = await attestDirect(EMPTY_WALLET);
    check("primitive: empty wallet → pass:false", empty.ok && empty.data.attestation.pass === false, JSON.stringify(empty.error || empty.data?.attestation?.pass));

    // Confirm the attestation carries a signature we did not produce (forwarded, not re-signed)
    check("attestation is InsumerAPI-signed (kid present)", holder.ok && typeof holder.data.sig === "string" && typeof holder.data.kid === "string", JSON.stringify({ kid: holder.data?.kid }));
  } finally {
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
