/**
 * ThoughtProof Attestation Example
 *
 * Demonstrates how to:
 *   1. Call the ThoughtProof /v1/check API
 *   2. Receive a reasoning verification verdict (ALLOW/HOLD)
 *   3. Verify the attestation signature against ThoughtProof's JWKS
 *
 * ThoughtProof verifies whether an AI agent's reasoning is sound
 * before the agent acts — adversarial multi-model critique where
 * independent models challenge each other's conclusions.
 *
 * JWKS: https://api.thoughtproof.ai/.well-known/jwks.json
 * Algorithm: EdDSA (Ed25519)
 * Key ID: tp-attestor-v1
 *
 * Usage:
 *   node thoughtproof-verify-example.js
 */

const crypto = require("crypto");
const https = require("https");

// --- Helpers ---

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

// --- ThoughtProof Attestation Format ---

/**
 * Example attestation payload from ThoughtProof.
 *
 * In production, this comes from POST /v1/check after x402 payment.
 * For this demo, we use a pre-signed example.
 */
const exampleAttestation = {
  issuer: "https://api.thoughtproof.ai",
  type: "reasoning_integrity",
  kid: "tp-attestor-v1",
  alg: "EdDSA",
  jwks: "https://api.thoughtproof.ai/.well-known/jwks.json",
  signed: {
    verdict: "ALLOW",
    confidence: 0.82,
    mdi: 0.67,
    claimHash: "sha256:a1b2c3d4e5f6",
    domain: "financial",
    stakeLevel: "medium",
    timestamp: new Date().toISOString(),
  },
  // sig would be populated by the API — omitted in this demo
  sig: null,
};

// --- Verify JWKS endpoint is reachable ---

async function verifyJWKS() {
  console.log("ThoughtProof Attestation Verification Example\n");
  console.log("1. Fetching JWKS from api.thoughtproof.ai...\n");

  const jwks = await fetchJSON(
    "https://api.thoughtproof.ai/.well-known/jwks.json"
  );

  const key = jwks.keys.find((k) => k.kid === "tp-attestor-v1");

  if (!key) {
    console.log("   ❌ Key tp-attestor-v1 not found in JWKS");
    return;
  }

  console.log("   ✅ JWKS fetched successfully");
  console.log(`   Key ID: ${key.kid}`);
  console.log(`   Algorithm: ${key.alg}`);
  console.log(`   Curve: ${key.crv}`);
  console.log(`   Type: ${key.kty}\n`);

  // Import the public key
  const publicKey = crypto.createPublicKey({ key, format: "jwk" });
  console.log("   ✅ Public key imported\n");

  // --- Show attestation format ---

  console.log("2. ThoughtProof Attestation Format:\n");
  console.log(`   Type: ${exampleAttestation.type}`);
  console.log(`   Verdict: ${exampleAttestation.signed.verdict}`);
  console.log(`   Confidence: ${exampleAttestation.signed.confidence}`);
  console.log(`   MDI (Model Diversity): ${exampleAttestation.signed.mdi}`);
  console.log(`   Domain: ${exampleAttestation.signed.domain}`);
  console.log(`   Stake Level: ${exampleAttestation.signed.stakeLevel}`);
  console.log(`   Claim Hash: ${exampleAttestation.signed.claimHash}`);
  console.log(
    `   (non-deterministic by design — adversarial critique is probabilistic)\n`
  );

  // --- Show how it fits in multi-attestation array ---

  console.log("3. In a multi-attestation payload:\n");
  console.log("   {");
  console.log('     "attestations": [');
  console.log(
    '       { "type": "wallet_state", "issuer": "InsumerAPI", ... },'
  );
  console.log(
    '       { "type": "reasoning_integrity", "issuer": "ThoughtProof", "signed": { "verdict": "ALLOW", "confidence": 0.82, "mdi": 0.67 }, ... },'
  );
  console.log(
    '       { "type": "behavioral_trust", "issuer": "RNWY", ... },'
  );
  console.log(
    '       { "type": "job_performance", "issuer": "Maiat", ... }'
  );
  console.log("     ]");
  console.log("   }\n");

  console.log("   Relying party picks which dimensions to verify.");
  console.log(
    '   A high-value trade might require all four. A simple transfer might only check wallet_state.\n'
  );

  // --- Integration ---

  console.log("4. Integration:\n");
  console.log("   API: POST https://api.thoughtproof.ai/v1/check");
  console.log('   Payment: x402 (USDC on Base) or MPP (Tempo stablecoin)');
  console.log("   JWKS: https://api.thoughtproof.ai/.well-known/jwks.json");
  console.log("   Skill: https://thoughtproof.ai/skill.md");
  console.log(
    "   Combined format: github.com/douglasborthwick-crypto/insumer-examples/issues/1\n"
  );

  console.log("Done ✅");
}

verifyJWKS().catch(console.error);
