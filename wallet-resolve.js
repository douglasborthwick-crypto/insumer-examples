/**
 * Wallet Resolver — Multi-Attestation Fetcher
 *
 * Takes a wallet address, calls InsumerAPI first (the foundation layer),
 * then fans out to all attestation providers in parallel. Each provider
 * that supports wallet-based lookup resolves directly; others use
 * demo identifiers until they ship wallet params.
 *
 * InsumerAPI reads the wallet → determines chain activity → that context
 * feeds downstream to every other provider.
 *
 * Output: a standard multi-attestation envelope ({ version, attestations[] })
 * compatible with multi-attest-verify.js.
 *
 * Usage:
 *   INSUMER_API_KEY=... node wallet-resolve.js <wallet> [solanaWallet] [xrplWallet] [bitcoinWallet]
 *
 * Or as a module:
 *   const { resolveWallet } = require('./wallet-resolve');
 *   const envelope = await resolveWallet({ wallet: '0x...', solanaWallet: '...' });
 *
 * Then verify:
 *   const { verifyMultiAttestation } = require('./multi-attest-verify');
 *   const result = await verifyMultiAttestation(envelope);
 *
 * No dependencies — Node.js built-in crypto and https only.
 */

const https = require("https");

// Demo identifiers for providers that don't yet support wallet lookup
const DEMO_IDS = {
  rnwy: { id: "16907", chain: "base" },
  aps: "claude-operator",
  agentgraph: "1e7b584d-2621-47a8-a314-20b9a908353a",
  sar: { task_id: "profile-check", spec: { expected: "wallet-trust-profile" }, output: { expected: "wallet-trust-profile" } }
};

/**
 * Fetch JSON over HTTPS with timeout and redirect support.
 */
function fetchJSON(url, options, maxRedirects) {
  maxRedirects = maxRedirects === undefined ? 3 : maxRedirects;
  options = options || {};
  return new Promise((resolve, reject) => {
    const method = options.method || "GET";
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: options.headers || {}
    };

    const req = https.request(reqOptions, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(fetchJSON(next, options, maxRedirects - 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error("HTTP " + res.statusCode + " from " + url));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON from " + url)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout: " + url)); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ─── Provider fetchers ───────────────────────────────────────────

/**
 * 1. InsumerAPI (foundation) — reads wallet state across 33 chains.
 * Returns the signed trust profile + chain context for downstream providers.
 */
async function fetchInsumerAPI(wallet, solanaWallet, xrplWallet, bitcoinWallet) {
  const apiKey = process.env.INSUMER_API_KEY;
  if (!apiKey) throw new Error("INSUMER_API_KEY not set");

  const body = { wallet };
  if (solanaWallet) body.solanaWallet = solanaWallet;
  if (xrplWallet) body.xrplWallet = xrplWallet;
  if (bitcoinWallet) body.bitcoinWallet = bitcoinWallet;

  const data = await fetchJSON("https://api.insumermodel.com/v1/trust", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(body)
  });

  if (!data.ok || !data.data) throw new Error(data.error || "No data returned");
  const { trust, sig, kid } = data.data;

  // Extract chain context from the trust profile dimensions
  const chainsActive = Object.keys(trust.dimensions || {});

  return {
    attestation: {
      issuer: "https://api.insumermodel.com",
      type: "wallet_state",
      kid: kid || "insumer-attest-v1",
      alg: "ES256",
      jwks: "https://insumermodel.com/.well-known/jwks.json",
      signed: trust,
      sig: sig
    },
    // Chain context passed to downstream providers
    chainContext: {
      wallet: wallet,
      solanaWallet: solanaWallet || null,
      xrplWallet: xrplWallet || null,
      bitcoinWallet: bitcoinWallet || null,
      chainsActive: chainsActive
    }
  };
}

/**
 * 2. RNWY — behavioral_trust.
 * Wallet lookup shipped Apr 10, 2026 at /api/trust-check?wallet={addr}.
 * rnwy-trust-v2 shipped the same day with `owner` and `expiry` inside the
 * signed block, and the v2 public key is now published in the JWKS alongside
 * v1. v2 signatures verify end-to-end, so we prefer v2 (signature-layer
 * wallet binding via `owner`) and fall back to v1 only if v2 is absent from
 * the response. Unknown wallets return {found:false} and we fall back to
 * the demo agent.
 */
async function fetchRNWY(chainContext) {
  const wallet = chainContext.wallet;
  if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    try {
      const lookup = await fetchJSON(
        "https://rnwy.com/api/trust-check?wallet=" + wallet
      );
      // Prefer v2 (signature-bound wallet via `owner`); fall back to v1 during migration.
      const att = lookup.attestation || lookup.attestationV1;
      if (att && lookup.found !== false) {
        return att;
      }
    } catch (e) {
      // Fall through to demo agent on error
    }
  }
  const data = await fetchJSON(
    "https://rnwy.com/api/trust-check?id=" + DEMO_IDS.rnwy.id + "&chain=" + DEMO_IDS.rnwy.chain
  );
  if (!data.attestation) throw new Error("No attestation in response");
  return data.attestation;
}

/**
 * 3. ThoughtProof — reasoning_integrity.
 * Uses wallet in claim context. Requires THOUGHTPROOF_API_KEY.
 */
async function fetchThoughtProof(chainContext) {
  const apiKey = process.env.THOUGHTPROOF_API_KEY;
  if (!apiKey) throw new Error("THOUGHTPROOF_API_KEY not set");

  const data = await fetchJSON("https://api.thoughtproof.ai/v1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({
      agentId: process.env.THOUGHTPROOF_AGENT_ID || "demo",
      claim: "Wallet " + chainContext.wallet.slice(0, 10) + "... holds sufficient assets for transaction",
      verdict: "VERIFIED",
      domain: "financial"
    })
  });
  if (!data.jwt) throw new Error(data.error || "No JWT returned");
  return {
    issuer: "https://api.thoughtproof.ai",
    type: "reasoning_integrity",
    kid: "tp-attestor-v1",
    alg: "EdDSA",
    jwks: "https://api.thoughtproof.ai/.well-known/jwks.json",
    signed: null,
    sig: data.jwt,
    expiry: data.expiresAt
  };
}

/**
 * 4. AgentID — trust_verification.
 * Wallet lookup: LIVE — Harold shipped `?wallet=` directly on the
 * trust-header endpoint Apr 8 (no public follow-up — confirmed via probe).
 * Collapses the previous two-step verify→trust-header into one call.
 * Accepts both Solana and EVM wallet formats syntactically; falls back to
 * demo agent if no entity is bound.
 */
async function fetchAgentID(chainContext) {
  var wallet = chainContext.wallet;
  var data;

  if (wallet) {
    try {
      data = await fetchJSON(
        "https://www.getagentid.dev/api/v1/agents/trust-header?wallet=" + encodeURIComponent(wallet)
      );
      if (data && data.header) {
        return {
          issuer: "https://getagentid.dev",
          type: "trust_verification",
          kid: "agentid-2026-03",
          alg: "EdDSA",
          jwks: "https://getagentid.dev/.well-known/jwks.json",
          signed: null,
          sig: data.header
        };
      }
    } catch (e) {
      // Fall through to demo agent
    }
  }

  // Fallback: demo agent attestation
  data = await fetchJSON(
    "https://www.getagentid.dev/api/v1/agents/trust-header?agent_id=agent_d1b7ef01f9af191f"
  );
  if (!data.header) throw new Error("No header in response");
  return {
    issuer: "https://getagentid.dev",
    type: "trust_verification",
    kid: "agentid-2026-03",
    alg: "EdDSA",
    jwks: "https://getagentid.dev/.well-known/jwks.json",
    signed: null,
    sig: data.header
  };
}

/**
 * 5. AgentGraph — security_posture.
 * Wallet lookup: LIVE (kenneives shipped Apr 9). Tries the wallet→entity
 * lookup first; if the wallet is bound to an entity with a linked repo, we
 * get a fully signed scan back. Otherwise falls back to the demo entity.
 */
async function fetchAgentGraph(chainContext) {
  var wallet = chainContext.wallet;
  if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    try {
      var lookupData = await fetchJSON(
        "https://agentgraph.co/api/v1/public/scan/wallet/" + wallet + "?chain=ethereum"
      );
      if (lookupData.found && lookupData.scan && lookupData.scan.jws) {
        var scan = lookupData.scan;
        return {
          issuer: "https://agentgraph.co",
          type: "security_posture",
          kid: scan.key_id || "agentgraph-security-v1",
          alg: scan.algorithm || "EdDSA",
          jwks: scan.jwks_url || "https://agentgraph.co/.well-known/jwks.json",
          signed: null,
          sig: scan.jws
        };
      }
      // States 1 and 2 (no entity / no linked repo) fall through to demo
    } catch (e) {
      // Fall through to demo on error
    }
  }
  var data = await fetchJSON(
    "https://agentgraph.co/api/v1/entities/" + DEMO_IDS.agentgraph + "/attestation/security"
  );
  if (!data.jws) throw new Error("No JWS in response");
  return {
    issuer: "https://agentgraph.co",
    type: "security_posture",
    kid: data.key_id || "agentgraph-security-v1",
    alg: data.algorithm || "EdDSA",
    jwks: data.jwks_url || "https://agentgraph.co/.well-known/jwks.json",
    signed: null,
    sig: data.jws
  };
}

/**
 * APS canonical serialization — mirrors the reference `canonicalize()` in
 * aeoess/agent-passport-system/src/core/canonical.ts. Sorts keys
 * alphabetically, strips null/undefined, compact JSON. Used to reconstruct
 * the binding payload for strict per-wallet verification.
 */
function apsCanonicalize(obj) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(apsCanonicalize).join(",") + "]";
  var keys = Object.keys(obj).filter(function(k) {
    return obj[k] !== null && obj[k] !== undefined;
  }).sort();
  return "{" + keys.map(function(k) {
    return JSON.stringify(k) + ":" + apsCanonicalize(obj[k]);
  }).join(",") + "}";
}

/**
 * Strict per-wallet binding_sig verification for the APS wallet_ref[] path.
 *
 * For the canonical `aeoess-bound-demo` fixture: fetches the published
 * fixture from the APS repo, reconstructs the canonical payload per
 * bind.ts > bindingPayload() (`{passport_id, chain, address, bound_at}` →
 * canonicalize), and verifies each wallet_ref[] entry's binding_sig against
 * the fixture pubkey using raw Ed25519.
 *
 * For other passport IDs: returns { verified: "not_applicable" } — the
 * binding_sig for a non-fixture passport is signed by the agent's private
 * key and the pubkey lives in the passport object itself. Production-
 * grade verification would fetch the passport object and extract its
 * `publicKey` field; that path is out of scope for this reference
 * verifier. Graceful degradation.
 */
async function verifyAPSWalletRefBindings(envelope) {
  if (!envelope || !Array.isArray(envelope.wallet_ref) || envelope.wallet_ref.length === 0) {
    return { verified: "no_wallet_ref", chains: [] };
  }
  var passportId = envelope.agent_id;
  if (passportId !== "aeoess-bound-demo") {
    return { verified: "not_applicable", reason: "non-fixture passport; pubkey must be fetched from passport object", chains: [] };
  }
  var fixture;
  try {
    fixture = await fetchJSON("https://raw.githubusercontent.com/aeoess/agent-passport-system/main/tests/fixtures/wallet-binding/aeoess-bound-demo.json");
  } catch (e) {
    return { verified: "fixture_fetch_failed", reason: e.message, chains: [] };
  }
  var pubKeyHex = fixture.fixture_public_key;
  if (!pubKeyHex) return { verified: "fixture_missing_pubkey", chains: [] };
  // Ed25519 raw 32-byte pubkey → DER SPKI for Node's crypto.createPublicKey
  var spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  var spki = Buffer.concat([spkiPrefix, Buffer.from(pubKeyHex, "hex")]);
  var crypto = require("crypto");
  var pubKey = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  var chains = [];
  var allPassed = true;
  for (var i = 0; i < envelope.wallet_ref.length; i++) {
    var ref = envelope.wallet_ref[i];
    var payload = apsCanonicalize({
      passport_id: passportId,
      chain: ref.chain,
      address: ref.address,
      bound_at: ref.bound_at,
    });
    var ok;
    try {
      ok = crypto.verify(null, Buffer.from(payload, "utf8"), pubKey, Buffer.from(ref.binding_sig, "hex"));
    } catch (e) {
      ok = false;
    }
    chains.push({ chain: ref.chain, address: ref.address, bound_at: ref.bound_at, verified: ok });
    if (!ok) allPassed = false;
  }
  return { verified: allPassed ? "pass" : "fail", chains: chains };
}

/**
 * 6. APS (Agent Passport System) — passport_grade + strict wallet_ref[] binding.
 *
 * Wallet lookup: LIVE via the `/api/v1/public/trust/by-wallet/{address}`
 * reverse index (shipped 2026-04-10 by aeoess, fixed 2026-04-10 for the
 * sequential-bind sub-second precision drift). Returns the envelope-level
 * passport_grade JWS AND the wallet_ref[] array with per-wallet binding_sig
 * values, both in one response.
 *
 * Two layers of verification:
 *   (1) envelope-level Ed25519 JWS against gateway-v1 JWKS — handled by the
 *       main multi-attest-verify.js verifier downstream
 *   (2) strict per-wallet binding_sig verification via verifyAPSWalletRefBindings() —
 *       runs inline here for the canonical fixture passport; graceful
 *       degradation for other passport IDs
 *
 * The returned attestation object carries the strict binding result on
 * `_strictWalletBinding` (leading underscore = metadata, not part of the
 * signed envelope) so downstream code can surface it in the trace.
 */
async function fetchAPS(chainContext) {
  var wallet = chainContext.wallet;
  var envelope = null;
  var attData = null;
  if (wallet) {
    try {
      envelope = await fetchJSON(
        "https://gateway.aeoess.com/api/v1/public/trust/by-wallet/" + encodeURIComponent(wallet)
      );
      if (envelope && envelope.found && envelope.agent_id) {
        // Warm step required: /attestation returns 404 unless /trust/{id} is hit first
        // to prime the gateway's attestation cache. Same pattern as profile.js and the
        // demo fallback below.
        await fetchJSON(
          "https://gateway.aeoess.com/api/v1/public/trust/" + encodeURIComponent(envelope.agent_id)
        );
        attData = await fetchJSON(
          "https://gateway.aeoess.com/api/v1/public/trust/" + encodeURIComponent(envelope.agent_id) + "/attestation"
        );
      }
    } catch (e) {
      // Fall through to demo
      envelope = null;
      attData = null;
    }
  }
  if (!attData || !attData.jws) {
    // Fallback: demo agent
    envelope = await fetchJSON("https://gateway.aeoess.com/api/v1/public/trust/" + DEMO_IDS.aps);
    attData = await fetchJSON(
      "https://gateway.aeoess.com/api/v1/public/trust/" + DEMO_IDS.aps + "/attestation"
    );
    if (!attData.jws) throw new Error("No JWS in response");
  }
  var strictResult = await verifyAPSWalletRefBindings(envelope);
  return {
    issuer: attData.issuer || "https://gateway.aeoess.com",
    type: attData.type || "passport_grade",
    kid: attData.kid || "gateway-v1",
    alg: attData.alg || "EdDSA",
    jwks: attData.jwks || "https://gateway.aeoess.com/.well-known/jwks.json",
    signed: attData.signed,
    sig: attData.jws,
    _strictWalletBinding: strictResult  // metadata, not part of signed envelope
  };
}

/**
 * 7. Maiat — job_performance.
 * Wallet lookup: accepts wallet address directly.
 */
async function fetchMaiat(chainContext) {
  // Maiat accepts EVM wallet addresses
  var addr = /^0x[a-fA-F0-9]{40}$/.test(chainContext.wallet)
    ? chainContext.wallet
    : "0xE6ac05D2b50cd525F793024D75BB6f519a52Af5D"; // demo fallback

  var data = await fetchJSON(
    "https://app.maiat.io/api/v1/attest?address=" + addr
  );
  if (!data.token) throw new Error("No token in response");
  return {
    issuer: "https://app.maiat.io",
    type: "job_performance",
    kid: data.kid || "maiat-trust-v1",
    alg: "ES256",
    jwks: data.jwks || "https://app.maiat.io/.well-known/jwks.json",
    signed: data.payload,
    sig: data.token
  };
}

/**
 * 8. SAR (SettlementWitness) — settlement_witness.
 * Wallet lookup: counterparty field accepted at envelope level AND now
 * inside the signed JWS payload as of kid sar-prod-ed25519-03 (shipped
 * 2026-04-10). Post-upgrade receipts cryptographically bind the
 * counterparty wallet — "this wallet is the counterparty on this signed
 * receipt" is provable offline with nothing but the signed bytes.
 * Legacy kid -02 / -01 receipts remain valid under their original
 * transport-layer semantics.
 *
 * Wallet-indexed receipt history is also available via
 *   GET https://defaultverifier.com/settlement-witness/receipts?wallet={addr}
 * which returns the array of signed receipt records associated with a
 * counterparty. Consumers that want per-wallet delivery history should
 * call /receipts directly — see the SkyeProfile orchestrator for an
 * example composition that reads both the fresh /attest signature and
 * the historical /receipts lookup in one pass.
 */
async function fetchSAR(chainContext) {
  var body = Object.assign({}, DEMO_IDS.sar);
  if (chainContext.wallet && typeof chainContext.wallet === "string") {
    body.counterparty = chainContext.wallet;
  }
  var data = await fetchJSON("https://defaultverifier.com/settlement-witness/attest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!data.jws) throw new Error("No JWS in response");
  return {
    issuer: data.issuer || "https://defaultverifier.com",
    type: data.type || "settlement_witness",
    kid: data.kid || "sar-prod-ed25519-03",
    alg: data.alg || "EdDSA",
    jwks: data.jwks || "https://defaultverifier.com/.well-known/jwks.json",
    signed: null,
    sig: data.jws
  };
}

/**
 * 9. Revettr — compliance_risk.
 * Wallet lookup: LIVE. Accepts wallet via `wallet_address` (we alias from `wallet`).
 * Chain-agnostic: scans Base, Ethereum, Optimism, Arbitrum by default.
 * EVM only — Solana wallets would not resolve.
 */
async function fetchRevettr(chainContext) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(chainContext.wallet)) {
    throw new Error("Revettr requires an EVM wallet");
  }
  var data = await fetchJSON("https://revettr.com/v1/attest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet_address: chainContext.wallet })
  });
  if (!data.jws) throw new Error("No JWS in response");
  return {
    issuer: data.provider?.id || "did:web:revettr.com",
    type: "compliance_risk",
    kid: data.kid || "revettr-attest-v1",
    alg: data.algorithm || "ES256",
    jwks: data.jwks_url || "https://revettr.com/.well-known/jwks.json",
    signed: null,
    sig: data.jws,
    expiry: data.expires_at ? new Date(data.expires_at * 1000).toISOString() : undefined
  };
}

// ─── Orchestrator ────────────────────────────────────────────────

/**
 * Resolve a wallet address into a multi-attestation envelope.
 *
 * Step 1: InsumerAPI reads the wallet (foundation layer)
 * Step 2: All other providers called in parallel with chain context
 * Step 3: Assemble into standard envelope
 *
 * @param {object} opts
 * @param {string} opts.wallet - EVM wallet address (0x...)
 * @param {string} [opts.solanaWallet] - Solana wallet address
 * @param {string} [opts.xrplWallet] - XRPL r-address
 * @param {string} [opts.bitcoinWallet] - Bitcoin address
 * @returns {object} Multi-attestation envelope { version, attestations[], meta }
 */
async function resolveWallet(opts) {
  var wallet = opts.wallet;
  var solanaWallet = opts.solanaWallet || null;
  var xrplWallet = opts.xrplWallet || null;
  var bitcoinWallet = opts.bitcoinWallet || null;

  // Step 1: InsumerAPI reads the wallet — this is the foundation
  console.log("[1] InsumerAPI: reading wallet state...");
  var insumerResult = await fetchInsumerAPI(wallet, solanaWallet, xrplWallet, bitcoinWallet);
  var chainContext = insumerResult.chainContext;

  var trust = insumerResult.attestation.signed;
  console.log("[+] InsumerAPI: " + (trust.summary?.totalChecks || 0) + " checks across " +
    (trust.summary?.dimensionsChecked || 0) + " dimensions (" +
    chainContext.chainsActive.join(", ") + ")");

  // Step 2: Fan out to all other providers in parallel, passing chain context
  var providers = [
    { name: "RNWY", fn: fetchRNWY },
    { name: "ThoughtProof", fn: fetchThoughtProof },
    { name: "AgentID", fn: fetchAgentID },
    { name: "AgentGraph", fn: fetchAgentGraph },
    { name: "APS", fn: fetchAPS },
    { name: "Maiat", fn: fetchMaiat },
    { name: "SAR", fn: fetchSAR },
    { name: "Revettr", fn: fetchRevettr }
  ];

  console.log("[2] Resolving " + providers.length + " providers in parallel...");

  var results = await Promise.allSettled(
    providers.map(function(p) { return p.fn(chainContext); })
  );

  // Step 3: Assemble envelope
  var attestations = [insumerResult.attestation];
  var errors = [];
  var walletResolved = ["InsumerAPI"];

  for (var i = 0; i < providers.length; i++) {
    var result = results[i];
    if (result.status === "fulfilled") {
      attestations.push(result.value);
      console.log("[+] " + providers[i].name + ": ok");
      // Surface APS strict wallet_ref binding_sig verification result inline
      if (providers[i].name === "APS" && result.value._strictWalletBinding) {
        var strict = result.value._strictWalletBinding;
        if (strict.verified === "pass") {
          console.log("    strict wallet_ref binding_sig: PASS (" + strict.chains.length + " chains)");
          for (var c = 0; c < strict.chains.length; c++) {
            var ch = strict.chains[c];
            console.log("      " + ch.chain + " " + ch.address + " bound_at=" + ch.bound_at + " → PASS");
          }
        } else if (strict.verified === "fail") {
          console.log("    strict wallet_ref binding_sig: FAIL");
          for (var c2 = 0; c2 < strict.chains.length; c2++) {
            var ch2 = strict.chains[c2];
            console.log("      " + ch2.chain + " " + ch2.address + " bound_at=" + ch2.bound_at + " → " + (ch2.verified ? "PASS" : "FAIL"));
          }
        } else if (strict.verified === "not_applicable") {
          console.log("    strict wallet_ref binding_sig: not applicable (non-fixture passport)");
        } else if (strict.verified === "no_wallet_ref") {
          console.log("    strict wallet_ref binding_sig: no wallet_ref[] on envelope");
        } else {
          console.log("    strict wallet_ref binding_sig: " + strict.verified + (strict.reason ? " — " + strict.reason : ""));
        }
      }
    } else {
      console.log("[-] " + providers[i].name + ": " + result.reason.message);
      errors.push({ provider: providers[i].name, error: result.reason.message });
    }
  }

  // Track which providers resolved from the actual wallet vs demo IDs
  // AgentID resolves from Solana wallet when available
  if (solanaWallet || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    walletResolved.push("AgentID");
  }
  if (/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    walletResolved.push("Maiat");
    walletResolved.push("Revettr");
  }

  return {
    version: "1",
    attestations: attestations,
    expired: [],
    meta: {
      wallet: wallet,
      solanaWallet: solanaWallet,
      xrplWallet: xrplWallet,
      bitcoinWallet: bitcoinWallet,
      chainsActive: chainContext.chainsActive,
      resolvedAt: new Date().toISOString(),
      walletResolved: walletResolved,
      demoFallback: providers.map(function(p) { return p.name; })
        .filter(function(n) { return walletResolved.indexOf(n) === -1; }),
      errors: errors
    }
  };
}

// ─── CLI ─────────────────────────────────────────────────────────

async function main() {
  var wallet = process.argv[2];
  if (!wallet) {
    console.error("Usage: INSUMER_API_KEY=... node wallet-resolve.js <wallet> [solanaWallet] [xrplWallet] [bitcoinWallet]");
    console.error("");
    console.error("InsumerAPI reads the wallet first (foundation), then all other");
    console.error("providers are called in parallel with that chain context.");
    console.error("");
    console.error("Output is a multi-attestation envelope compatible with multi-attest-verify.js:");
    console.error("  node wallet-resolve.js 0x... | node -e \"...\"");
    console.error("");
    console.error("Or pipe to verifier:");
    console.error("  const { resolveWallet } = require('./wallet-resolve');");
    console.error("  const { verifyMultiAttestation } = require('./multi-attest-verify');");
    console.error("  const envelope = await resolveWallet({ wallet: '0x...' });");
    console.error("  const result = await verifyMultiAttestation(envelope);");
    process.exit(1);
  }

  var opts = {
    wallet: wallet,
    solanaWallet: process.argv[3] || null,
    xrplWallet: process.argv[4] || null,
    bitcoinWallet: process.argv[5] || null
  };

  console.log("Resolving wallet: " + wallet);
  if (opts.solanaWallet) console.log("Solana wallet: " + opts.solanaWallet);
  if (opts.xrplWallet) console.log("XRPL wallet: " + opts.xrplWallet);
  if (opts.bitcoinWallet) console.log("Bitcoin wallet: " + opts.bitcoinWallet);
  console.log("");

  var envelope = await resolveWallet(opts);

  console.log("");
  console.log("=".repeat(60));
  console.log("Envelope: " + envelope.attestations.length + " attestations");
  console.log("Wallet-resolved: " + envelope.meta.walletResolved.join(", "));
  console.log("Demo fallback: " + (envelope.meta.demoFallback.join(", ") || "none"));
  if (envelope.meta.errors.length > 0) {
    console.log("Errors: " + envelope.meta.errors.length);
  }
  console.log("");

  // Now verify the envelope
  try {
    var verifier = require("./multi-attest-verify");
    console.log("Verifying " + envelope.attestations.length + " attestations...");
    console.log("");
    var result = await verifier.verifyMultiAttestation(envelope, { checkExpiry: false });
    for (var r of result.results) {
      var status = r.expired ? "EXPIRED" : r.signatureValid ? "VERIFIED" : "FAILED";
      var pad = (r.type + "                         ").slice(0, 25);
      var kidPad = (r.kid + "                         ").slice(0, 25);
      console.log("  " + pad + kidPad + status);
      if (r.error) console.log("    Error: " + r.error);
    }
    console.log("");
    console.log("Summary: " + result.summary.verified + "/" + result.summary.total + " verified");
  } catch (e) {
    console.log("(Verifier not available: " + e.message + ")");
    console.log("Run from the same directory as multi-attest-verify.js to auto-verify.");
  }
}

module.exports = { resolveWallet };

if (require.main === module) {
  main().catch(function(err) {
    console.error(err);
    process.exit(1);
  });
}
