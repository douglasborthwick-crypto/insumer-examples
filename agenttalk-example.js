/**
 * AgentTalk Example — Condition-Gated Agent Sessions
 *
 * Demonstrates both AgentTalk flows:
 *
 *   Bilateral (default):
 *     1. Agent A declares a channel with conditions (capacity 2)
 *     2. Agent B joins — both wallets attested via InsumerAPI
 *     3. Session established — verify on demand
 *
 *   Multi-party (town hall):
 *     1. Creator declares a channel with capacity + autoStart
 *     2. Agents join a live session — each attested on entry
 *     3. Re-verify ejects agents who lose credentials
 *     4. Creator can kick, agents can leave
 *
 * No artificial cap on participants — bilateral, working group, or town hall.
 * Every agent must satisfy the same conditions. Lose the credential, get ejected.
 *
 * API: https://skyemeta.com/api/agenttalk/
 * Docs: https://skyemeta.com/agenttalk/
 *
 * No dependencies — uses Node.js built-in https module.
 *
 * Usage:
 *   node agenttalk-example.js                                    # bilateral (2 agents)
 *   node agenttalk-example.js multiparty                         # multi-party (3 agents)
 *   AGENTTALK_API_KEY=insr_live_... node agenttalk-example.js    # use your own key
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

function printAgents(agents) {
  console.log(`   Agents attested: ${agents.length}`);
  for (const agent of agents) {
    const att = agent.attestation.attestation;
    console.log(`     ${agent.wallet}`);
    console.log(`       pass: ${att.pass}, id: ${att.id}`);
    console.log(`       sig: ${agent.attestation.sig.substring(0, 30)}...`);
    console.log(`       kid: ${agent.attestation.kid}`);
    console.log(`       jwt: ${agent.attestation.jwt ? "present" : "none"}`);
  }
}

// ─── Bilateral flow (capacity 2, default) ───────────────────────

async function bilateral() {
  console.log("AgentTalk — Bilateral Session (2 agents)");
  console.log("=".repeat(60));
  console.log("");

  const agentA = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const agentB = "0x55FE002aefF02F77364de339a1292923A15844B8";

  const apiKey = process.env.AGENTTALK_API_KEY;

  // --- Step 1: Declare channel ---
  console.log("1. Agent A declares a bilateral channel...");
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
  console.log(`   Capacity: ${declareRes.data.capacity || 2}`);
  console.log(`   Conditions hash: ${conditionsHash}`);
  console.log(`   Expires: ${expiresAt}\n`);

  // --- Step 2: Join channel ---
  console.log("2. Agent B joins the channel...");
  console.log(`   Wallet: ${agentB}\n`);

  const joinRes = await request(`${BASE_URL}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, wallet: agentB }),
  });

  if (joinRes.status !== 200 || !joinRes.data.sessionId) {
    console.log("   FAILED:", JSON.stringify(joinRes.data));
    return;
  }

  const { sessionId, agents } = joinRes.data;
  console.log(`   Session: ${sessionId}`);
  printAgents(agents);
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
  }

  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log(`  Channel: ${channelId}`);
  console.log(`  Session: ${sessionId}`);
  console.log(`  All agents attested: YES`);
  console.log(`  Attestation signatures: ECDSA ES256 (kid: insumer-attest-v1)`);
  console.log(`  JWKS: https://insumermodel.com/.well-known/jwks.json`);
  console.log(`  Conditions hash: ${conditionsHash}`);
  console.log("");
  console.log("Every agent verified against the same on-chain conditions.");
  console.log("Each attestation is independently verifiable via JWKS.");
  console.log("Lose the credential, get ejected from the room.");
}

// ─── Multi-party flow (capacity N, autoStart) ──────────────────

async function multiparty() {
  console.log("AgentTalk — Multi-Party Session (3 agents, autoStart)");
  console.log("=".repeat(60));
  console.log("");

  // Three wallets that hold USDC on Ethereum
  const creator = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const agentB = "0x55FE002aefF02F77364de339a1292923A15844B8";
  const agentC = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";

  const apiKey = process.env.AGENTTALK_API_KEY;

  // --- Step 1: Declare with capacity + autoStart ---
  console.log("1. Creator declares a multi-party channel (capacity: 5, autoStart: true)...");
  console.log(`   Wallet: ${creator}`);
  console.log(`   Condition: Hold >= 1 USDC on Ethereum\n`);

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const declareRes = await request(`${BASE_URL}/declare`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      wallet: creator,
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
      capacity: 5,
      autoStart: true,
      expiresIn: 300,
    }),
  });

  if (declareRes.status !== 200 || !declareRes.data.channelId) {
    console.log("   FAILED:", JSON.stringify(declareRes.data));
    return;
  }

  const { channelId, conditionsHash, sessionId, expiresAt } = declareRes.data;
  console.log(`   Channel: ${channelId}`);
  console.log(`   Session (live immediately): ${sessionId}`);
  console.log(`   Capacity: ${declareRes.data.capacity}`);
  console.log(`   Conditions hash: ${conditionsHash}`);
  console.log(`   Expires: ${expiresAt}\n`);

  // --- Step 2: Agent B joins the live session ---
  console.log("2. Agent B joins the live session...");
  console.log(`   Wallet: ${agentB}\n`);

  const joinB = await request(`${BASE_URL}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, wallet: agentB }),
  });

  if (joinB.status !== 200 || !joinB.data.sessionId) {
    console.log("   FAILED:", JSON.stringify(joinB.data));
    return;
  }

  console.log(`   Session: ${joinB.data.sessionId}`);
  printAgents(joinB.data.agents);
  console.log("");

  // --- Step 3: Agent C joins too ---
  console.log("3. Agent C joins the live session...");
  console.log(`   Wallet: ${agentC}\n`);

  const joinC = await request(`${BASE_URL}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, wallet: agentC }),
  });

  if (joinC.status !== 200 || !joinC.data.sessionId) {
    console.log("   FAILED:", JSON.stringify(joinC.data));
    return;
  }

  console.log(`   Session: ${joinC.data.sessionId}`);
  printAgents(joinC.data.agents);
  console.log("");

  // --- Step 4: Verify session (all 3 agents) ---
  console.log("4. Verify session (all 3 agents)...");

  const verifyRes = await request(
    `${BASE_URL}/session?id=${sessionId}`,
    { method: "GET" }
  );

  if (verifyRes.status === 200) {
    const s = verifyRes.data;
    console.log(`   Valid: ${s.valid}`);
    console.log(`   Agents: ${s.agents.length}`);
    console.log(`   Capacity: ${s.capacity}`);
    console.log(`   Conditions: ${s.conditions.length}`);
    console.log(`   Issued: ${s.issuedAt}`);
    console.log(`   Expires: ${s.expiresAt}`);
  }

  // --- Step 5: Creator kicks Agent C ---
  console.log("\n5. Creator kicks Agent C...");

  const kickRes = await request(`${BASE_URL}/kick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channelId,
      wallet: agentC,
      creatorWallet: creator,
    }),
  });

  if (kickRes.status === 200) {
    console.log(`   Kicked: ${kickRes.data.kicked}`);
    console.log(`   Remaining: ${kickRes.data.remainingAgents.join(", ")}`);
  } else {
    console.log("   FAILED:", JSON.stringify(kickRes.data));
  }

  // --- Step 6: Agent B leaves voluntarily ---
  console.log("\n6. Agent B leaves voluntarily...");

  const leaveRes = await request(`${BASE_URL}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, wallet: agentB }),
  });

  if (leaveRes.status === 200) {
    console.log(`   Left: ${leaveRes.data.left}`);
    console.log(`   Remaining: ${leaveRes.data.remainingAgents?.join(", ") || "(creator only)"}`);
  } else {
    console.log("   FAILED:", JSON.stringify(leaveRes.data));
  }

  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log(`  Channel: ${channelId}`);
  console.log(`  Session: ${sessionId}`);
  console.log(`  Capacity: 5 (3 joined, 1 kicked, 1 left)`);
  console.log(`  Attestation signatures: ECDSA ES256 (kid: insumer-attest-v1)`);
  console.log(`  JWKS: https://insumermodel.com/.well-known/jwks.json`);
  console.log("");
  console.log("Multi-party session: agents join, get kicked, or leave.");
  console.log("Re-verify ejects anyone who loses a credential.");
  console.log("The room stays clean.");
}

// ─── Entry point ────────────────────────────────────────────────

const mode = process.argv[2];

if (mode === "multiparty") {
  multiparty().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
} else {
  bilateral().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
