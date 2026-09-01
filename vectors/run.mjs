// run.mjs — verify every vector in this directory against its stated expectation.
//
//   npm install insumer-verify
//   node run.mjs
//
// Exit 0 = every vector produced exactly the expected result. Exit 1 = at least
// one did not. A vector that "fails" here means either the verifier is wrong or
// the vector is; it is not a judgement about the wallet.
import { verifyAttestation } from "insumer-verify";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => /^\d\d-.*\.json$/.test(f)).sort();

let failed = 0;
for (const f of files) {
  const v = JSON.parse(readFileSync(join(here, f), "utf8"));
  let result;
  try {
    result = await verifyAttestation(v.response, v.options ?? {});
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
