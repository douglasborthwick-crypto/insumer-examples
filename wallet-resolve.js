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
 * signed block, but the v2 public key has not yet been published to the
 * JWKS — so v2 signatures cannot be verified end-to-end against
 * https://rnwy.com/.well-known/jwks.json. Pinning to v1 (attestationV1)
 * until the v2 kid lands in JWKS, then flipping back to prefer v2. Unknown
 * wallets return {found:false} and we fall back to the demo agent.
 */
async function fetchRNWY(chainContext) {
  const wallet = chainContext.wallet;
  if (wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    try {
      const lookup = await fetchJSON(
        "https://rnwy.com/api/trust-check?wallet=" + wallet
      );
      // Pin to v1 (attestationV1) until v2 kid is in JWKS; prefer v2 once verifiable.
      const att = lookup.attestationV1 || lookup.attestation;
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
 * 6. APS (Agent Passport System) — passport_grade.
 * Wallet lookup: LIVE — aeoess shipped silently (no public follow-up,
 * confirmed via probe). /trust/{wallet} accepts a wallet path; if APS
 * has the wallet registered, the warm step returns found:true and the
 * attestation step returns a signed JWS. Otherwise falls back to demo.
 */
async function fetchAPS(chainContext) {
  var wallet = chainContext.wallet;
  if (wallet) {
    try {
      var warmData = await fetchJSON(
        "https://gateway.aeoess.com/api/v1/public/trust/" + encodeURIComponent(wallet)
      );
      if (warmData && warmData.found) {
        var attData = await fetchJSON(
          "https://gateway.aeoess.com/api/v1/public/trust/" + encodeURIComponent(wallet) + "/attestation"
        );
        if (attData && attData.jws) {
          return {
            issuer: attData.issuer || "https://gateway.aeoess.com",
            type: attData.type || "passport_grade",
            kid: attData.kid || "gateway-v1",
            alg: attData.alg || "EdDSA",
            jwks: attData.jwks || "https://gateway.aeoess.com/.well-known/jwks.json",
            signed: attData.signed,
            sig: attData.jws
          };
        }
      }
    } catch (e) {
      // Fall through to demo
    }
  }
  // Fallback: demo agent
  await fetchJSON("https://gateway.aeoess.com/api/v1/public/trust/" + DEMO_IDS.aps);
  var data = await fetchJSON(
    "https://gateway.aeoess.com/api/v1/public/trust/" + DEMO_IDS.aps + "/attestation"
  );
  if (!data.jws) throw new Error("No JWS in response");
  return {
    issuer: data.issuer || "https://gateway.aeoess.com",
    type: data.type || "passport_grade",
    kid: data.kid || "gateway-v1",
    alg: data.alg || "EdDSA",
    jwks: data.jwks || "https://gateway.aeoess.com/.well-known/jwks.json",
    signed: data.signed,
    sig: data.jws
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
 * Wallet lookup: counterparty field accepted at envelope level. The signed
 * payload commits to spec/output match — counterparty flows through but is
 * NOT cryptographically bound (confirmed by decoding the /attest JWS).
 * nutstrut committed Apr 10 to adding counterparty to the signed payload in
 * a future release; until then the binding is transport-layer.
 *
 * Apr 10: Wallet-indexed receipt history is now available via
 *   GET https://defaultverifier.com/settlement-witness/receipts?wallet={addr}
 * which returns the array of signed receipt records associated with a
 * counterparty. This reference script still uses /attest for the dimension
 * signature to keep the envelope shape uniform across providers. Consumers
 * that want per-wallet delivery history should call /receipts directly —
 * see the SkyeProfile orchestrator for an example composition.
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
    kid: data.kid || "sar-prod-ed25519-02",
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
