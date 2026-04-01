/**
 * Multi-Attestation Verifier
 *
 * Verifies an array of independent attestations from multiple issuers.
 * Each attestation has its own signature, key ID, algorithm, and JWKS endpoint.
 * The verifier fetches each issuer's public key and checks the signature independently.
 *
 * Supported algorithms:
 *   - ES256 (ECDSA P-256) — InsumerAPI, RNWY, Maiat
 *   - EdDSA (Ed25519) — ThoughtProof, APS
 *
 * No dependencies — uses Node.js built-in crypto and https modules.
 *
 * Usage:
 *   node multi-attest-verify.js
 *
 * Or import as a module:
 *   const { verifyMultiAttestation } = require('./multi-attest-verify');
 *   const result = await verifyMultiAttestation(payload, { requiredTypes: ['wallet_state'] });
 */

const crypto = require("crypto");
const https = require("https");

// --- JWKS cache (in-memory, per-process) ---
const jwksCache = new Map();
const JWKS_CACHE_TTL = 3600 * 1000; // 1 hour

/**
 * Fetch JSON over HTTPS. Returns parsed JSON.
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Fetch a public key from a JWKS endpoint by kid. Caches results.
 * Returns a Node.js KeyObject ready for verification.
 */
async function getPublicKey(jwksUrl, kid, alg) {
  const cacheKey = `${jwksUrl}:${kid}`;
  const cached = jwksCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL) {
    return cached.key;
  }

  const jwks = await fetchJSON(jwksUrl);
  const keys = jwks.keys || [];
  const jwk = keys.find((k) => k.kid === kid);

  if (!jwk) {
    throw new Error(`Key ${kid} not found in JWKS at ${jwksUrl}`);
  }

  let keyObject;

  if (alg === "ES256" && jwk.kty === "EC" && jwk.crv === "P-256") {
    keyObject = crypto.createPublicKey({ key: jwk, format: "jwk" });
  } else if (alg === "EdDSA" && jwk.kty === "OKP" && jwk.crv === "Ed25519") {
    keyObject = crypto.createPublicKey({ key: jwk, format: "jwk" });
  } else {
    throw new Error(
      `Unsupported key type: alg=${alg}, kty=${jwk.kty}, crv=${jwk.crv}`
    );
  }

  jwksCache.set(cacheKey, { key: keyObject, fetchedAt: Date.now() });
  return keyObject;
}

/**
 * Decode base64url string to Buffer.
 */
function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

/**
 * Convert P1363 signature (r || s, 64 bytes for P-256) to DER format.
 * Node.js crypto.verify with EC keys expects DER.
 */
function p1363ToDer(sig, keySize) {
  keySize = keySize || 32;
  const r = sig.subarray(0, keySize);
  const s = sig.subarray(keySize, keySize * 2);

  function encodeInt(buf) {
    // Strip leading zeros, add 0x00 if high bit set
    let i = 0;
    while (i < buf.length - 1 && buf[i] === 0) i++;
    buf = buf.subarray(i);
    if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0x00]), buf]);
    return Buffer.concat([Buffer.from([0x02, buf.length]), buf]);
  }

  const rDer = encodeInt(r);
  const sDer = encodeInt(s);
  const body = Buffer.concat([rDer, sDer]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

/**
 * Verify a single attestation's signature.
 *
 * For ES256 (P1363 base64): decode base64, convert P1363→DER, verify with SHA-256.
 * For EdDSA (Ed25519): decode base64, verify directly (no hash needed).
 * For JWT format: decode header.payload, verify signature part.
 */
async function verifySignature(attestation) {
  const { kid, alg, jwks, signed, sig } = attestation;

  if (!kid || !alg || !jwks || !sig) {
    return { valid: false, error: "Missing kid, alg, jwks, or sig" };
  }

  try {
    const publicKey = await getPublicKey(jwks, kid, alg);

    // Check if sig looks like a JWT (three dot-separated parts)
    if (typeof sig === "string" && sig.split(".").length === 3) {
      // JWT format — verify the whole JWT
      const parts = sig.split(".");
      const signingInput = parts[0] + "." + parts[1];
      const sigBytes = base64urlDecode(parts[2]);

      if (alg === "ES256") {
        const derSig = p1363ToDer(sigBytes, 32);
        const ok = crypto.verify(
          "SHA256",
          Buffer.from(signingInput),
          publicKey,
          derSig
        );
        return { valid: ok, error: ok ? null : "ES256 JWT signature invalid" };
      } else if (alg === "EdDSA") {
        const ok = crypto.verify(null, Buffer.from(signingInput), publicKey, sigBytes);
        return { valid: ok, error: ok ? null : "EdDSA JWT signature invalid" };
      }
    }

    // Raw signature format — sig is base64 over JSON.stringify(signed)
    if (!signed) {
      return { valid: false, error: "Missing signed payload" };
    }

    const message = JSON.stringify(signed);
    const sigBuffer = Buffer.from(sig, "base64");

    if (alg === "ES256") {
      const derSig = p1363ToDer(sigBuffer, 32);
      const ok = crypto.verify("SHA256", Buffer.from(message), publicKey, derSig);
      return { valid: ok, error: ok ? null : "ES256 signature invalid" };
    } else if (alg === "EdDSA") {
      const ok = crypto.verify(null, Buffer.from(message), publicKey, sigBuffer);
      return { valid: ok, error: ok ? null : "EdDSA signature invalid" };
    }

    return { valid: false, error: `Unsupported algorithm: ${alg}` };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Check if an attestation has expired.
 */
function isExpired(attestation) {
  const { signed, expiry } = attestation;

  // Check explicit expiry timestamp
  if (expiry && typeof expiry === "string" && !expiry.startsWith("TBD")) {
    const match = expiry.match(/^\d{4}-/);
    if (match) {
      return new Date(expiry) < new Date();
    }
  }

  // Check attestedAt + known TTLs
  const attestedAt =
    signed?.attestedAt || signed?.timestamp || signed?.iat;
  if (!attestedAt) return false;

  const attestTime = new Date(attestedAt).getTime();
  if (isNaN(attestTime)) return false;

  const now = Date.now();
  const age = now - attestTime;

  // Default: 30 minutes if no explicit expiry
  return age > 30 * 60 * 1000;
}

/**
 * Verify a multi-attestation payload.
 *
 * @param {object} payload - The multi-attestation object with `version` and `attestations[]`
 * @param {object} options
 * @param {string[]} options.requiredTypes - Array of type strings that must be present and valid
 * @param {boolean} options.checkExpiry - Whether to check expiration (default: true)
 * @returns {object} { valid, results[], summary }
 */
async function verifyMultiAttestation(payload, options) {
  options = options || {};
  const requiredTypes = options.requiredTypes || [];
  const checkExpiry = options.checkExpiry !== false;

  if (!payload || !Array.isArray(payload.attestations)) {
    return {
      valid: false,
      error: "Invalid payload: missing attestations array",
      results: [],
    };
  }

  const results = [];

  // Verify each attestation in parallel
  const verifications = payload.attestations.map(async (att) => {
    const result = {
      issuer: att.issuer,
      type: att.type,
      kid: att.kid,
      signatureValid: false,
      expired: false,
      error: null,
    };

    // Check expiry
    if (checkExpiry && isExpired(att)) {
      result.expired = true;
      result.error = "Attestation expired";
      return result;
    }

    // Verify signature
    const sigResult = await verifySignature(att);
    result.signatureValid = sigResult.valid;
    if (!sigResult.valid) {
      result.error = sigResult.error;
    }

    return result;
  });

  const settled = await Promise.all(verifications);
  results.push(...settled);

  // Check required types
  const missingTypes = [];
  for (const reqType of requiredTypes) {
    const match = results.find(
      (r) => r.type === reqType && r.signatureValid && !r.expired
    );
    if (!match) {
      missingTypes.push(reqType);
    }
  }

  const allValid = results.every((r) => r.signatureValid && !r.expired);
  const requiredMet = missingTypes.length === 0;

  return {
    valid: requiredMet && (requiredTypes.length > 0 || allValid),
    results,
    summary: {
      total: results.length,
      verified: results.filter((r) => r.signatureValid).length,
      expired: results.filter((r) => r.expired).length,
      failed: results.filter((r) => !r.signatureValid && !r.expired).length,
      missingRequired: missingTypes,
    },
  };
}

// --- CLI demo ---
async function main() {
  console.log("Multi-Attestation Verifier");
  console.log("=".repeat(60));
  console.log("");

  // Fetch live attestations from all five issuers
  console.log("Fetching live attestations from all five issuers...\n");

  // 1. InsumerAPI — requires API key
  const INSUMER_KEY = process.env.INSUMER_API_KEY;
  let insumerAttestation;
  if (INSUMER_KEY) {
    try {
      const res = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({
          wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
          conditions: [
            {
              type: "token_balance",
              contractAddress: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
              chainId: 1,
              threshold: 1000000,
              label: "SHIB holder",
            },
          ],
        });
        const req = https.request(
          "https://api.insumermodel.com/v1/attest",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": INSUMER_KEY,
            },
          },
          (resp) => {
            let data = "";
            resp.on("data", (c) => (data += c));
            resp.on("end", () => {
              try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
          }
        );
        req.on("error", reject);
        req.write(postData);
        req.end();
      });

      if (res.ok && res.data) {
        const { attestation, sig, kid } = res.data;
        insumerAttestation = {
          issuer: "https://api.insumermodel.com",
          type: "wallet_state",
          kid: kid,
          alg: "ES256",
          jwks: "https://insumermodel.com/.well-known/jwks.json",
          signed: {
            id: attestation.id,
            pass: attestation.pass,
            results: attestation.results,
            attestedAt: attestation.attestedAt,
          },
          sig: sig,
          expiry: attestation.expiresAt,
        };
        console.log(
          "[+] InsumerAPI: fetched (pass: " + attestation.pass + ", id: " + attestation.id + ")"
        );
      } else {
        console.log("[-] InsumerAPI: " + (res.error || res.message || "unexpected response"));
      }
    } catch (e) {
      console.log("[-] InsumerAPI: " + e.message);
    }
  } else {
    console.log(
      "[~] InsumerAPI: set INSUMER_API_KEY to include in demo"
    );
    console.log(
      "    (JWKS verified at insumermodel.com/.well-known/jwks.json)"
    );
  }

  // 3. RNWY — returns envelope directly
  let rnwyAttestation;
  try {
    const rnwy = await fetchJSON(
      "https://rnwy.com/api/trust-check?id=16907&chain=base"
    );
    if (rnwy.attestation) {
      rnwyAttestation = rnwy.attestation;
      console.log("[+] RNWY: fetched (score: " + rnwy.score + ")");
    } else {
      console.log("[-] RNWY: no attestation envelope in response");
    }
  } catch (e) {
    console.log("[-] RNWY: " + e.message);
  }

  // 4. Maiat — returns JWT
  let maiatAttestation;
  try {
    const maiat = await fetchJSON(
      "https://app.maiat.io/api/v1/attest?address=0xE6ac05D2b50cd525F793024D75BB6f519a52Af5D"
    );
    if (maiat.token) {
      maiatAttestation = {
        issuer: "https://app.maiat.io",
        type: "job_performance",
        kid: maiat.kid || "maiat-trust-v1",
        alg: "ES256",
        jwks: maiat.jwks || "https://app.maiat.io/.well-known/jwks.json",
        signed: maiat.payload,
        sig: maiat.token, // JWT format
      };
      console.log("[+] Maiat: fetched (score: " + maiat.payload?.score + ")");
    } else {
      console.log("[-] Maiat: unexpected response format");
    }
  } catch (e) {
    console.log("[-] Maiat: " + e.message);
  }

  // 2. ThoughtProof — requires operator key
  const TP_KEY = process.env.THOUGHTPROOF_API_KEY;
  let tpAttestation;
  if (TP_KEY) {
    try {
      const tp = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({
          agentId: process.env.THOUGHTPROOF_AGENT_ID || "demo",
          claim: "Wallet holds sufficient USDC for payment",
          verdict: "VERIFIED",
          domain: "financial",
        });
        const req = https.request(
          "https://api.thoughtproof.ai/v1/verify",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": TP_KEY,
            },
          },
          (resp) => {
            let data = "";
            resp.on("data", (c) => (data += c));
            resp.on("end", () => {
              try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
          }
        );
        req.on("error", reject);
        req.write(postData);
        req.end();
      });

      if (tp.jwt) {
        tpAttestation = {
          issuer: "https://api.thoughtproof.ai",
          type: "reasoning_integrity",
          kid: "tp-attestor-v1",
          alg: "EdDSA",
          jwks: "https://api.thoughtproof.ai/.well-known/jwks.json",
          signed: null, // JWT format — signature is in the JWT itself
          sig: tp.jwt,
          expiry: tp.expiresAt,
        };
        console.log(
          "[+] ThoughtProof: fetched (verdict: " + tp.verdict + ", score: " + tp.score + ")"
        );
      } else {
        console.log("[-] ThoughtProof: " + (tp.error || "unexpected response"));
      }
    } catch (e) {
      console.log("[-] ThoughtProof: " + e.message);
    }
  } else {
    console.log(
      "[~] ThoughtProof: set THOUGHTPROOF_API_KEY to include in demo"
    );
    console.log(
      "    (JWKS verified at api.thoughtproof.ai/.well-known/jwks.json)"
    );
  }

  // 5. APS (Agent Passport System) — public, no API key
  let apsAttestation;
  try {
    // Warm the cache first (attestation endpoint requires a prior profile fetch)
    await fetchJSON("https://gateway.aeoess.com/api/v1/public/trust/claude-operator");
    const aps = await fetchJSON(
      "https://gateway.aeoess.com/api/v1/public/trust/claude-operator/attestation"
    );
    if (aps.jws) {
      apsAttestation = {
        issuer: aps.issuer,
        type: aps.type,
        kid: aps.kid,
        alg: aps.alg,
        jwks: aps.jwks,
        signed: aps.signed,
        sig: aps.jws, // APS returns "jws", verifier expects "sig"
      };
      console.log("[+] APS: fetched (grade: " + aps.signed?.grade + ", " + aps.signed?.grade_label + ")");
    } else {
      console.log("[-] APS: unexpected response format");
    }
  } catch (e) {
    console.log("[-] APS: " + e.message);
  }

  // Build multi-attestation payload from available attestations
  const attestations = [];
  if (insumerAttestation) attestations.push(insumerAttestation);
  if (tpAttestation) attestations.push(tpAttestation);
  if (rnwyAttestation) attestations.push(rnwyAttestation);
  if (maiatAttestation) attestations.push(maiatAttestation);
  if (apsAttestation) attestations.push(apsAttestation);

  if (attestations.length === 0) {
    console.log("\nNo live attestations available to verify.");
    return;
  }

  const payload = { version: "1", attestations, expired: [] };

  console.log(`\nVerifying ${attestations.length} attestation(s)...\n`);

  // Verify all
  const result = await verifyMultiAttestation(payload);

  console.log("Results:");
  console.log("-".repeat(60));
  for (const r of result.results) {
    const status = r.expired
      ? "EXPIRED"
      : r.signatureValid
        ? "VERIFIED"
        : "FAILED";
    console.log(`  ${r.issuer}`);
    console.log(`    Type: ${r.type}`);
    console.log(`    Kid:  ${r.kid}`);
    console.log(`    Status: ${status}`);
    if (r.error) console.log(`    Error: ${r.error}`);
    console.log("");
  }

  console.log("Summary:");
  console.log(`  Total: ${result.summary.total}`);
  console.log(`  Verified: ${result.summary.verified}`);
  console.log(`  Expired: ${result.summary.expired}`);
  console.log(`  Failed: ${result.summary.failed}`);
  console.log(`  Overall: ${result.valid ? "PASS" : "FAIL"}`);

  // Demo: verify with requiredTypes
  console.log("\n" + "=".repeat(60));
  console.log("Required types check: ['behavioral_trust']");
  const required = await verifyMultiAttestation(payload, {
    requiredTypes: ["behavioral_trust"],
  });
  console.log(
    `  Result: ${required.valid ? "PASS" : "FAIL"} (missing: ${required.summary.missingRequired.join(", ") || "none"})`
  );
}

// Export for use as module
module.exports = { verifyMultiAttestation, verifySignature, getPublicKey };

// Run CLI if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
