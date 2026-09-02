// run.mjs: verify every vector in this directory against its stated expectation.
//
//   npm install insumer-verify @noble/post-quantum
//   node run.mjs
//
// Exit 0 = every vector produced exactly the expected result. Exit 1 = at least
// one did not. A vector that "fails" here means either the verifier is wrong or
// the vector is; it is not a judgement about the wallet.
//
// An attestation vector (response.data.attestation) goes through verifyAttestation.
// A trust-profile vector (response.data.trust) goes through verifyTrustProfile.
import { verifyAttestation, verifyTrustProfile } from "insumer-verify";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => /^\d\d-.*\.json$/.test(f)).sort();
const ANCHOR_KEYS = ["blockNumber", "blockTimestamp", "slot", "ledgerIndex", "ledgerHash", "checkpointSequence", "blockHeight", "blockHash"];

let failed = 0;
for (const f of files) {
  const v = JSON.parse(readFileSync(join(here, f), "utf8"));
  const isTrust = v.response?.data?.trust !== undefined;
  let result;
  try {
    result = isTrust
      ? await verifyTrustProfile(v.response, v.options ?? {})
      : await verifyAttestation(v.response, v.options ?? {});
  } catch (e) {
    result = { checks: null, threw: e.message };
  }
  const problems = [];
  if (!result.checks) {
    problems.push(`threw before producing checks: ${result.threw}`);
  } else {
    for (const [name, want] of Object.entries(v.expected.checks)) {
      const got = result.checks[name]?.passed;
      if (name === "pq" && result.checks.pq === undefined) {
        problems.push("pq: this verifier predates insumer-verify 1.8.0 and reports no post-quantum verdict");
        continue;
      }
      if (got !== want) problems.push(`${name}: expected ${want}, got ${got}`);
    }
    if (v.expected.pq && result.checks.pq && result.checks.pq.status !== v.expected.pq.status)
      problems.push(`pq.status: expected ${v.expected.pq.status}, got ${result.checks.pq.status}`);
    const wantAtt = v.expected.attestation;
    if (wantAtt) {
      const a = v.response.data.attestation;
      if (a.pass !== wantAtt.pass) problems.push(`pass: expected ${wantAtt.pass}, got ${a.pass}`);
      wantAtt.results.forEach((r, i) => {
        if (a.results[i].met !== r.met)
          problems.push(`results[${i}].met: expected ${r.met}, got ${a.results[i].met}`);
      });
    }
    // Trust profiles: the not-evaluated marker (specification 11.3). A check whose chain
    // wallet was not supplied carries evaluated: false, a reason, the parameter it needs,
    // and no anchor, and is counted apart from pass and fail. Never a failure.
    const wantTrust = v.expected.trust;
    if (wantTrust) {
      const t = v.response.data.trust;
      const s = t.summary;
      for (const [k, want] of Object.entries(wantTrust.summary ?? {})) {
        if (s[k] !== want) problems.push(`summary.${k}: expected ${want}, got ${s[k]}`);
      }
      if (s.totalPassed + s.totalFailed + s.totalNotEvaluated !== s.totalChecks)
        problems.push("summary: totalPassed + totalFailed + totalNotEvaluated does not equal totalChecks");
      for (const [name, dim] of Object.entries(t.dimensions)) {
        const n = dim.checks.filter((c) => c.evaluated === false).length;
        if (dim.notEvaluatedCount !== n) problems.push(`${name}.notEvaluatedCount: expected ${n}, got ${dim.notEvaluatedCount}`);
        if (dim.passCount + dim.failCount + dim.notEvaluatedCount !== dim.total)
          problems.push(`${name}: passCount + failCount + notEvaluatedCount does not equal total`);
      }
      for (const ne of wantTrust.notEvaluated ?? []) {
        const c = t.dimensions[ne.dimension]?.checks.find((x) => x.label === ne.label);
        if (!c) { problems.push(`${ne.dimension} / ${ne.label}: check not found`); continue; }
        if (c.evaluated !== false || c.reason !== "wallet_not_provided" || c.requires !== ne.requires)
          problems.push(`${ne.dimension} / ${ne.label}: expected evaluated false, reason wallet_not_provided, requires ${ne.requires}`);
        if (c.met !== false) problems.push(`${ne.dimension} / ${ne.label}: an unevaluated check reports met false`);
        if (ANCHOR_KEYS.some((k) => k in c)) problems.push(`${ne.dimension} / ${ne.label}: an unevaluated check carries no anchor`);
      }
    }
  }
  if (problems.length) {
    failed++;
    console.log(`FAIL  ${v.vector}`);
    for (const p of problems) console.log(`        ${p}`);
  } else {
    console.log(`ok    ${v.vector}`);
  }
}
console.log("");
console.log(`${files.length - failed}/${files.length} vectors matched their expectation.`);
process.exit(failed ? 1 : 0);
