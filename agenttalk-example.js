/**
 * AgentTalk Example — Condition-Gated Agent-to-Agent Sessions
 *
 * Demonstrates the full AgentTalk flow:
 *   1. Agent A declares a channel with on-chain conditions
 *   2. Agent B joins the channel with its wallet
 *   3. Both wallets are attested via InsumerAPI (ECDSA-signed JWTs)
 *   4. Session is established — verify on demand
 *
 * AgentTalk wraps InsumerAPI into a two-party session layer.
 * Both agents must satisfy the same conditions. Sell the token, lose the session.
 *
 * API: https://skyemeta.com/api/agenttalk/
 * Docs: https://skyemeta.com/agenttalk/
 *
 * No dependencies — uses Node.js built-in https module.
 *
 * Usage:
 *   node agenttalk-example.js
 *   AGENTTALK_API_KEY=insr_live_... node agenttalk-example.js   # use your own key
 */

const https = require("https");

const BASE_URL = "https://skyemeta.com/api/agenttalk";

/**
 * POST or GET request. Returns parsed JSON.
 */
function request(url, options) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error(`Timeout: ${url}`));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  console.log("AgentTalk — Condition-Gated Agent Sessions");
  console.log("=".repeat(60));
  console.log("");

  // Two wallets that both hold USDC on Ethereum
  const agentA = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const agentB = "0x55FE002aefF02F77364de339a1292923A15844B8";

  const apiKey = process.env.AGENTTALK_API_KEY;

  // --- Step 1: Declare channel ---
  console.log("1. Agent A declares a channel with conditions...");
  console.log(`   Wallet: ${agentA}`);
  console.log(`   Condition: Hold >= 1 USDC on Ethereum\n`);

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const declareRes = await request(`${BASE_URL}/declare`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      wallet: agentA,
      conditions: [
        {
          type: "token_balance",
          contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          chainId: 1,
          threshold: 1,
          decimals: 6,
          label: "USDC on Ethereum",
        },
      ],
      expiresIn: 300,
    }),
  });

  if (declareRes.status !== 200 || !declareRes.data.channelId) {
    console.log("   FAILED:", JSON.stringify(declareRes.data));
    return;
  }

  const { channelId, conditionsHash, expiresAt } = declareRes.data;
  console.log(`   Channel: ${channelId}`);
  console.log(`   Conditions hash: ${conditionsHash}`);
  console.log(`   Expires: ${expiresAt}\n`);

  // --- Step 2: Join channel ---
  console.log("2. Agent B joins the channel...");
  console.log(`   Wallet: ${agentB}\n`);

  const joinRes = await request(`${BASE_URL}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channelId,
      wallet: agentB,
    }),
  });

  if (joinRes.status !== 200 || !joinRes.data.sessionId) {
    console.log("   FAILED:", JSON.stringify(joinRes.data));
    if (joinRes.data.pass === false) {
      console.log("   Agent B's wallet does not meet the channel conditions.");
    }
    return;
  }

  const { sessionId, agents } = joinRes.data;
  console.log(`   Session: ${sessionId}`);
  console.log(`   Agents attested: ${agents.length}`);
  for (const agent of agents) {
    const att = agent.attestation.attestation;
    console.log(`     ${agent.wallet}`);
    console.log(`       pass: ${att.pass}, id: ${att.id}`);
    console.log(`       sig: ${agent.attestation.sig.substring(0, 30)}...`);
    console.log(`       kid: ${agent.attestation.kid}`);
    console.log(`       jwt: ${agent.attestation.jwt ? "present" : "none"}`);
  }
  console.log("");

  // --- Step 3: Verify session ---
  console.log("3. Verify session...");

  const verifyRes = await request(
    `${BASE_URL}/session?id=${sessionId}`,
    { method: "GET" }
  );

  if (verifyRes.status === 200) {
    const s = verifyRes.data;
    console.log(`   Valid: ${s.valid}`);
    console.log(`   Agents: ${s.agents.length}`);
    console.log(`   Conditions: ${s.conditions.length}`);
    console.log(`   Issued: ${s.issuedAt}`);
    console.log(`   Expires: ${s.expiresAt}`);
  } else {
    console.log("   FAILED:", JSON.stringify(verifyRes.data));
  }

  // --- Summary ---
  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log(`  Channel: ${channelId}`);
  console.log(`  Session: ${sessionId}`);
  console.log(`  Both agents attested: YES`);
  console.log(`  Attestation signatures: ECDSA ES256 (kid: insumer-attest-v1)`);
  console.log(`  JWKS: https://insumermodel.com/.well-known/jwks.json`);
  console.log(`  Conditions hash: ${conditionsHash}`);
  console.log("");
  console.log("Both agents verified against the same on-chain conditions.");
  console.log("Each attestation is independently verifiable via JWKS.");
  console.log("Session can be re-verified at any time — sell the token, lose the session.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
