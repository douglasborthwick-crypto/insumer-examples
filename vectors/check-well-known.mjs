// check-well-known.mjs — confirm the discovery copy at
// insumermodel.com/.well-known/state-attestation-test-vectors.json carries the
// same vectors as this directory, byte for byte on every signed field.
//
//   node check-well-known.mjs [url]
//
// This directory is the authority. The .well-known file is a convenience copy,
// so the two can drift; this is how that gets noticed.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const URL_ =
  process.argv[2] ||
  "https://insumermodel.com/.well-known/state-attestation-test-vectors.json";
const here = dirname(fileURLToPath(import.meta.url));

const res = await fetch(URL_);
if (!res.ok) {
  console.error(`fetch failed: HTTP ${res.status}`);
  process.exit(2);
}
const wk = await res.json();

const files = readdirSync(here).filter((f) => /^\d\d-.*\.json$/.test(f)).sort();
let bad = 0;
for (const f of files) {
  const local = JSON.parse(readFileSync(join(here, f), "utf8"));
  const remote = wk.vectors?.[local.vector];
  if (!remote) {
    console.log(`MISSING  ${local.vector} is not in the discovery copy`);
    bad++;
    continue;
  }
  const problems = [];
  if (JSON.stringify(remote.response) !== JSON.stringify(local.response))
    problems.push("response differs");
  if (JSON.stringify(remote.expected) !== JSON.stringify(local.expected))
    problems.push("expected differs");
  if (JSON.stringify(remote.recompute) !== JSON.stringify(local.recompute))
    problems.push("recompute differs");
  if (JSON.stringify(remote.options ?? {}) !== JSON.stringify(local.options ?? {}))
    problems.push("options differ");
  if (problems.length) {
    console.log(`DRIFT    ${local.vector}: ${problems.join(", ")}`);
    bad++;
  } else {
    console.log(`ok       ${local.vector}`);
  }
}
const extra = Object.keys(wk.vectors ?? {}).filter(
  (k) => !files.some((f) => JSON.parse(readFileSync(join(here, f), "utf8")).vector === k)
);
for (const k of extra) {
  console.log(`EXTRA    ${k} is in the discovery copy but not in this directory`);
  bad++;
}
console.log("");
console.log(bad ? `${bad} problem(s).` : "Discovery copy matches this directory.");
process.exit(bad ? 1 : 0);
