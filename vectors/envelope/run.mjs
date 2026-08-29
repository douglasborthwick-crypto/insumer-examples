// run.mjs — verify every envelope fixture against its stated expectation.
//
//   node run.mjs
//
// Uses ../../multi-attest-verify.js, the reference verifier for the payload
// format in MULTI-ATTESTATION-SPEC.md. Exit 0 = every fixture produced exactly
// the expected result.
//
// These test composition, not a single signature. The question is whether one
// bad entry in an envelope changes any other entry's verdict, and whether the
// aggregate is reproducible from the per-slot results and the pinned options.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const { verifyMultiAttestation } = require_(join(here, "..", "..", "multi-attest-verify.js"));

const files = readdirSync(here).filter((f) => /^E\d\d-.*\.json$/.test(f)).sort();
let failedFixtures = 0; // fixtures that did not match their expected block
let failedChecks = 0;   // cross-fixture property assertions that did not hold

for (const f of files) {
  const fx = JSON.parse(readFileSync(join(here, f), "utf8"));
  const problems = [];
  let out;
  try {
    out = await verifyMultiAttestation(fx.payload, fx.options ?? {});
  } catch (e) {
    problems.push(`threw: ${e.message}`);
  }
  if (out) {
    if (out.valid !== fx.expected.valid)
      problems.push(`valid: expected ${fx.expected.valid}, got ${out.valid}`);
    fx.expected.slots.forEach((want, i) => {
      const got = out.results[i];
      if (!got) { problems.push(`slot ${i}: missing from result`); return; }
      for (const k of ["signatureValid", "expired"]) {
        if (got[k] !== want[k]) problems.push(`slot ${i}.${k}: expected ${want[k]}, got ${got[k]}`);
      }
      const wantErr = want.error ?? null;
      const gotErr = got.error ?? null;
      if (wantErr !== gotErr) problems.push(`slot ${i}.error: expected ${JSON.stringify(wantErr)}, got ${JSON.stringify(gotErr)}`);
    });
    for (const [k, want] of Object.entries(fx.expected.summary)) {
      const got = out.summary[k];
      const same = Array.isArray(want)
        ? JSON.stringify(want) === JSON.stringify(got)
        : want === got;
      if (!same) problems.push(`summary.${k}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    }
  }
  if (problems.length) {
    failedFixtures++;
    console.log(`FAIL  ${fx.fixture}`);
    for (const p of problems) console.log(`        ${p}`);
  } else {
    console.log(`ok    ${fx.fixture}`);
  }
}
// The strip test's actual claim is comparative: slot 1's verdict must be
// identical in every fixture that is E01 with slot 0 altered. Checking each
// fixture against its own expected block does not assert that on its own, so
// assert it directly.
const slot1 = {};
for (const f of files) {
  const fx = JSON.parse(readFileSync(join(here, f), "utf8"));
  if (!/^E0[12378]-/.test(f)) continue;
  const out = await verifyMultiAttestation(fx.payload, fx.options ?? {});
  slot1[fx.fixture] = JSON.stringify({
    signatureValid: out.results[1].signatureValid,
    expired: out.results[1].expired,
    error: out.results[1].error ?? null,
  });
}
const names = Object.keys(slot1);
const baseline = slot1[names[0]];
const moved = names.filter((n) => slot1[n] !== baseline);
console.log("");
if (moved.length) {
  failedChecks++;
  console.log("FAIL  slot independence: slot 1's verdict changed when slot 0 was altered");
  for (const n of names) console.log(`        ${n}: ${slot1[n]}`);
} else {
  console.log(`ok    slot independence: slot 1's verdict is identical across ${names.join(", ")}`);
}

// MULTI-ATTESTATION-SPEC.md section 5.3 carries a MUST: the aggregate is derived from
// the per-slot verdicts and the verifier options and is an input to none of them, so
// recomputing it from those two must reproduce the emitted value. Its limit, stated
// plainly: this restates the verifier's own formula, so it is a consistency check rather
// than an independence proof. It catches the aggregate drifting away from the slot
// results, which is the channel 5.3 exists to close. It does not catch the formula
// itself being wrong.
let failedAggregate = 0;
for (const f of files) {
  const fx = JSON.parse(readFileSync(join(here, f), "utf8"));
  const opts = fx.options ?? {};
  const out = await verifyMultiAttestation(fx.payload, opts);
  const req = opts.requiredTypes ?? [];
  const live = (r) => r.signatureValid && !r.expired;
  const missing = req.filter((t) => !out.results.some((r) => r.type === t && live(r)));
  const recomputed = missing.length === 0 && (req.length > 0 || out.results.every(live));
  if (recomputed !== out.valid) {
    failedAggregate++;
    failedChecks++;
    console.log(`FAIL  aggregate recompute ${fx.fixture}: slots plus options give ${recomputed}, emitted ${out.valid}`);
  }
}
if (!failedAggregate) console.log("ok    aggregate reproduces from the slot verdicts and the pinned options");

console.log("");
console.log(`${files.length - failedFixtures}/${files.length} fixtures matched their expectation.`);
if (failedChecks) console.log(`${failedChecks} cross-fixture check(s) failed.`);
process.exit(failedFixtures + failedChecks ? 1 : 0);
