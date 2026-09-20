# InsumerAPI attestation test vectors

Twenty-three vectors: twenty-one attestations and two trust profiles, each paired with the result
a correct verifier must produce.

Eleven are issuer responses saved exactly as the API returned them: 01 to 07, 12, 13, 17 and 18.
The other twelve are derived from those. Eleven of the twelve carry a deliberate edit to the signed
bytes or to the labelling around them (08, 09, 10, 11, 14, 15, 19, 20, 21, 22 and 23), and the
twelfth, 16, is byte-identical to vector 01 and differs only in the verifier options it is
presented under. The derived cases are the point of the set: a corpus where everything passes
demonstrates very little, and the question a verifier has to answer correctly is which artifacts
it refuses.

```bash
npm ci          # installs exactly the pinned versions below, from the lockfile
node run.mjs
node check-well-known.mjs   # optional: compares the discovery copy served at insumermodel.com
```

Use `npm ci`, not `npm install`. `npm install insumer-verify @noble/post-quantum` rewrites the
exact versions in `package.json` into caret ranges, which silently undoes the pinning this
directory depends on.

`run.mjs` exits 0 only if every vector produces exactly its stated expectation.

## What a passing run establishes, and under which versions

`run.mjs` verifies with `insumer-verify`, the reference verifier published by the same issuer that
produced these artifacts. A 23/23 result is therefore the issuer's verifier agreeing with the
issuer's own stated expectations. It is not an independent confirmation, and it is not offered as
one. What the set gives a third party is everything needed to disagree: the bytes, the options, the
expected verdicts and the reasoning behind each are all published here, so an independent verifier
can be written against them and can contradict any of it.

The verdicts depend on the verifier version, so the versions the published verdicts were produced
under are pinned in `package.json` in this directory, with a lockfile:

| Package | Version |
|---|---|
| `insumer-verify` | 1.8.4 |
| `@noble/post-quantum` | 0.7.1 |

`@noble/post-quantum` is what lets the verifier check the ML-DSA-65 companion. Without it every
companion is reported as `unverifiable`, and six vectors stop matching their expectations: 12, 13,
17 and 18, whose companions should verify, and 14 and 21, whose companions should be refuted. The
other companion cases are unaffected because they already expect something other than a verified or
refuted companion. A run missing the library reports 17/23 rather than failing loudly, which is why
it is a pinned dependency here rather than an optional extra.

Earlier verifiers disagree with the stated expectations, which is the reason the versions are
pinned rather than a caveat on them: 1.8.0 reports the companion on attestations but not on trust
profiles, and 1.8.0 and 1.8.1 accept the missing `kid` of vector 19 and report the mislabelled
companion of vector 22 as verified. The kid rules those two vectors exercise arrived in 1.8.2.

Later verifiers agree. The pin stays at the version the published verdicts were produced under, so
this table is a record rather than a recommendation, but the expectations were re-run against
`insumer-verify` 1.8.5 on 2026-09-20 and all 23 still matched. 1.8.5 adds a 128-level bound on
canonicalization depth (`MAX_CANONICAL_DEPTH`); no vector here nests past 9, so none of them meets
it.

## The key material these verdicts were produced against

Twelve vectors, 11 to 22, carry a `jwksUrl` and resolve their keys over the network when they run.
The other eleven verify against the public key built into `insumer-verify` and fetch nothing.

The signed bytes here are frozen; the key set they resolve against is not. `jwks-2026-09-18.json`
is the JWKS as served on 2026-09-18, saved byte for byte:

```
sha256  506d8ee2b056c65d4267237209b1802e3376bd5e3b08e988158bdacb9fc7a244
```

It carries five entries over two keys: `insumer-attest-v1`, `insumer-attest-v2` and
`insumer-trust-v2` on one P-256 key, then the two RFC 9964 `AKP` entries `insumer-attest-pq1` and
`insumer-trust-pq1` on one ML-DSA-65 key. Those are the keys every positive verdict in this set was
produced against. Two of the negative cases depend on the same snapshot in the opposite direction:
vector 11 names `insumer-attest-v9` and vector 15 names `insumer-attest-pq9`, neither of which
resolves to anything in it, so those two hold only for as long as no key by either name is
published. Vector 23 names `insumer-attest-v9` as well but fetches nothing, so it depends on the
key built into `insumer-verify` rather than on this snapshot.

If a `kid` used here is ever rotated out of the live JWKS, a run against the live endpoint will
stop matching these expectations while the frozen bytes remain exactly as valid as they were. This
snapshot is the record of what they were checked against: serve it locally and point the `jwksUrl`
of the affected vectors at it to reproduce the published verdicts after such a rotation.

## What each vector contains

| Field | Meaning |
|---|---|
| `response` | The artifact as the verifier receives it. On the eleven issuer responses it is the API response verbatim, nothing reformatted, reordered or trimmed. On the eleven edited derivations it is that response carrying the single deliberate edit its row names. On 16 it is vector 01's response unchanged, since that vector varies the options rather than the bytes. |
| `recompute` | For each result: the canonical `evaluatedCondition` byte string, the claimed `conditionHash`, whether the hash reproduces from those bytes, and the chain anchor. |
| `options` | The verifier options this vector is evaluated under. Pinned per vector, because a verdict is a function of the input and the options together. |
| `expected` | The five verdicts a correct verifier must produce (signature, condition hashes, freshness, expiry, post-quantum companion), the companion's status (`verified`, `refuted`, `absent`, `unverifiable`), and where relevant the `pass` and per-result `met` values. A trust-profile vector has four verdicts (there are no condition hashes to check on the trust path) and an `expected.trust` block naming the summary counts and the checks that carry the not-evaluated marker. |

## The vectors

| # | Vector | Must produce |
|---|---|---|
| 01 | USDC on Ethereum mainnet, `gte 1`, met | all checks pass, `met: true` |
| 02 | USDC `gte 1000`, not met | all checks pass, `met: false` |
| 03 | DAI `gte 1`, an 18-decimal token | all checks pass, `met: true` |
| 04 | WETH `gte 1` | all checks pass, `met: true` |
| 05 | Two conditions, one met and one not | `pass: false`, `results[0].met: true` |
| 06 | USDC on Base, a second EVM chain | all checks pass, `met: true` |
| 07 | Native BTC on Bitcoin | all checks pass, `met: true` |
| 08 | 01 with the signed threshold rewritten | signature **and** hash fail |
| 09 | 01 with one character of the signature changed | signature fails, hash still passes |
| 10 | 01 with the claimed `conditionHash` replaced | signature **and** hash fail |
| 11 | 01 presented with a `kid` that resolves to no key | fails closed |
| 12 | A v2 attestation carrying the post-quantum companion (`pqSig`, `pqKid`) as issued | all checks pass, companion `verified` |
| 13 | A v1 (frozen bare-JSON scheme) attestation carrying the same companion | all checks pass, companion `verified` |
| 14 | 12 with one byte of `pqSig` altered | classical checks pass, companion `refuted`, artifact fails |
| 15 | 12 presented with a `pqKid` that resolves to no key, under a verifier that requires the companion | companion `unverifiable`, fails under the cutoff |
| 16 | 01, issued before the companion existed, under a verifier whose cutoff has passed | companion `absent`, fails under the cutoff |
| 17 | The JWT envelope: the ES256 `jwt` with its ML-DSA-65 sibling `pqJwt` | all checks pass, companion `verified` |
| 18 | A trust profile from `POST /v1/trust` with only the EVM wallet supplied, six checks carrying the not-evaluated marker | all checks pass, companion `verified`, unevaluated checks are not failures |
| 19 | 13 with its `kid` removed | fails closed, companion `unverifiable` |
| 20 | 01 presented under `insumer-trust-v2`, the kid that signs trust profiles | signature fails, hash still passes |
| 21 | 18 presented under `insumer-attest-v2`, the kid that signs attestations | signature fails, companion `refuted` |
| 22 | 12 with its `pqKid` changed to `insumer-trust-pq1`, the companion kid for trust profiles | classical checks pass, companion `unverifiable`, not refused |
| 23 | 01 with an unknown `kid`, to a verifier given no JWKS URL | signature fails, hash still passes, never falls back to a key at hand |

## Which of them a verifier must refuse

Every vector here expects `expiry: false`, because every published vector is past its freshness
window, so that verdict does not separate them; the section below explains why it is expected. The
eleven a correct verifier must refuse are the ones carrying at least one expected `false` in
`checks` other than `expiry`:

```
08  09  10  11  14  15  16  19  20  21  23
```

Within those eleven, 14, 15 and 16 fail only at `checks.pq`, while 11, 19 and 21 fail at both the
classical and the companion layer. Vector 22 is not among them: outside `expiry` it carries no
expected `false`, and its companion reports `unverifiable`, which is reported without refusing the
artifact.

The predicate excludes `attestation.pass` deliberately. A signed `false` there is a verdict about
the wallet, not a verification failure. Vectors 02 and 05 expect `pass: false` and are fully valid
artifacts, correctly signed and correctly reporting that a condition was not met.

Three of the derived cases are chosen to be hard to pass by accident:

- **09** breaks the signature without touching the condition, so a verifier that collapses
  signature failure and hash integrity into one boolean gets the hash answer wrong.
- **10** is the inverse of 08: the hash is inside the signed payload, so editing the claimed
  hash breaks the signature too.
- **11** must fail rather than fall back to another key in the JWKS. A verifier that selects
  the first key when the `kid` matches nothing will happily check an unknown or forged `kid`
  against whichever key is listed first. `insumer-verify` has refused this from 1.7.0 onward.

Vectors 19 to 23 are about what a `kid` is allowed to do. A `kid` selects a key, a signing
scheme, and an artifact type, and a verifier has to honour all three:

- **19** has no `kid` at all. Nothing selects a key or a scheme, so nothing can be verified. It
  is derived from the v1-signed vector 13 because that is the case a fallback accepts: a
  verifier that defaults to the frozen bare-JSON scheme and to whatever key is at hand reports
  it valid. `insumer-verify` 1.8.0 and 1.8.1 did; 1.8.2 and later refuse it.
- **20** and **21** are the same mislabelling in both directions: an attestation under the
  trust kid, and a trust profile under the attestation kid. Both kids resolve, and to the same
  EC key, so a verifier that resolves the key and stops there verifies nothing wrong. A kid
  is bound to its artifact type, and the binding is what refuses these. On 21 the companion
  reads `refuted` as well: the companion signs the exact classical preimage the classical kid
  selects, so once the kid is rewritten there is no correct preimage to rebuild it over.
- **22** rewrites the `pqKid` to the other artifact's companion kid. The classical checks are
  untouched and pass. The companion kid resolves but names the wrong artifact type, so the
  companion is `unverifiable`: a mislabelled companion is evidence of nothing, and it is never
  re-interpreted under the kid the verifier expected. Without a `pqRequiredFrom` cutoff that is
  reported and not refused; under a cutoff that has passed it fails, as vector 15 does.
- **23** is vector 11 without the JWKS fetch, which is also why the two expect different verdicts
  from identical signed bytes. On 11 the verifier is given a JWKS, fetches it, finds no key for the
  `kid` and fails closed on every check. On 23 it was given no JWKS URL, so it never fetches: it
  reports the signature unverifiable against the key it holds and still completes the hash and
  freshness checks, which do not depend on key resolution. The verifier has been given no JWKS URL and holds
  a built-in key; the `kid` names no key it knows. It must still fail, and it must fail as
  could-not-verify rather than as forged: nothing about the signature has been shown wrong, the
  verifier simply has no key or scheme it is entitled to check it under. On the classical
  checks that distinction lives in the verdict's `reason`, since they report a boolean and a
  reason rather than a status.

Vector 18 is the one trust profile issued as-is. It was requested with only the EVM wallet, so
the six institutional-stablecoin checks that need a Solana, XRPL, Stellar or Sui wallet carry
the not-evaluated marker: `evaluated: false`, `reason: wallet_not_provided`, `requires` naming
the request parameter, `met: false` and no chain anchor. They are counted in
`notEvaluatedCount` on the dimension and `totalNotEvaluated` in the summary, never in the pass
or fail counts. An unevaluated check is not a failure; it is a check the issuer states, inside
the signed profile, that it did not run. The runner asserts the counts add up and that every
marker check has the marker's shape, alongside the four signature verdicts. Vector 21 is the
same profile mislabelled.

## Two things that will look wrong and are not

**Every vector fails the expiry check.** An attestation or trust profile carries a 30-minute
freshness window, so any published vector is past it. That is not a defect in the vector and it is not a
statement that the verdict is wrong. The attestation says *this wallet met this condition at
this block*, and that remains true permanently. The expiry timestamp is a freshness policy for
access decisions: after it passes you should not open a door on this attestation, but the
verdict it records does not become false. The expected results state `expiry: false`
explicitly for that reason, so each vector still matches exactly rather than being hedged.

Because `insumer-verify` derives its top-level `valid` as the AND of all its checks, `valid`
is `false` for every vector here. The per-check breakdown is what these vectors assert.

**Vector 02 is a `false` and it is correct.** A signed `false` is a verdict, not an error.
Thresholds are in token/display units, so `1000` means 1000 USDC rather than 1000 of its
smallest unit.

## What these prove, and what they do not

They prove the issuer half: that the issuer hashed and signed exactly the predicate it says it
evaluated, that the result is bound to a named point in chain history, and that corrupting any
part of it is detectable offline against a public key.

They do not re-run the chain read. That is the verifying party's own work, and it should be:
every vector carries the anchor and the evaluated predicate, which are the two inputs needed
to repeat the underlying state read against any node and compare. That read goes against
public chain state rather than against anything the issuer holds, which is what makes these
signals recomputable rather than merely signed.

Every verdict in this set was re-derived from chain state before publication, read at the
anchored block rather than at the chain tip. For vector 07 the anchor's block hash was also
checked against the block at that height. That re-derivation is an issuer statement about how
these were produced rather than something this corpus lets you check; what the corpus does let
you check is the signature, the condition hash and the anchor, and it carries the two inputs
needed to repeat the state read yourself.

Two things follow that a checker should expect. Balances at these addresses change after the
anchor, so a reading taken today will not match the anchored block. And repeating the reads
behind vectors 01 to 06 now needs archive access, because those blocks have passed out of the
state-retention window an ordinary EVM endpoint serves; vector 07 is unaffected, since Bitcoin
history stays available from any full node. Neither affects a vector: verifying one is a
signature check, a hash recomputation and a timestamp comparison, none of which touch the chain.

## Anchors differ by chain

Vectors 01 to 06 anchor on `blockNumber` with `blockTimestamp`. Vector 07 anchors on
`blockHeight` with `blockHash`, and its `chainId` is the string `"bitcoin"` rather than a
number. A verifier that assumes `blockNumber` finds no anchor on vector 07. The other
families follow the same pattern: `slot` on Solana, `ledgerIndex` with `ledgerHash` on XRPL
and Stellar, `checkpointSequence` on Sui. The six marker checks on vectors 18 and 21 carry no
anchor at all, because no chain was read for them; a freshness check skips them.

Every vector except 13 and 19 is signed under the v2 scheme, though for different reasons in the
two exceptions: 13 is genuinely v1-signed, while 19 has had its `kid` removed and so selects no
scheme at all. The rest are v2: attestations under
`insumer-attest-v2`, and the trust profiles under `insumer-trust-v2`, whose preimage is the
tag `insumer.trust.v2`, a newline, and the canonical JSON of the whole trust object with
`expiresAt` inside it. Vector 13 is signed under the v1 scheme (the frozen bare-JSON preimage
under `insumer-attest-v1`) and carries the same companion, because keys issued before the v2
rollout still sign v1 and remain verifiable unchanged; that is a live path rather than a
historical one. A verifier that implements only v2 passes every other vector here and fails
vector 13, which the specification requires it to select by `kid`.

Nine vectors carry a post-quantum companion: 12, 13, 14, 15, 17, 18, 19, 21 and 22. The rest
exercise the companion rules without carrying one, reporting `absent`, or `unverifiable` on 11
where nothing resolves at all. Its verdict is reported separately from the classical checks (spec
Section 12, Check 6): `refuted` always fails the artifact; `absent` and
`unverifiable` fail only under the verifier's own `pqRequiredFrom` cutoff, judged by the
verifier's clock, never by a timestamp inside the artifact.

## Wallets

Ethereum and Base vectors use `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` (vitalik.eth), the
address used throughout the InsumerAPI examples. The Bitcoin vector uses the genesis address
`1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`. Both are public, permanent and hold real balances, so
the vectors disclose nothing that was not already public. The trust vectors profile
`0xAd982CB19aCCa2923Df8F687C0614a7700255a23`, a public Ethereum address; a trust profile
carries booleans and counts, never balances.

## The envelope fixtures

`envelope/` holds eight fixtures for the multi-attestation envelope in `MULTI-ATTESTATION-SPEC.md`.
Those test composition, whether one bad entry changes another entry's verdict, rather than
whether a single attestation is genuine.

`check-well-known.mjs` compares this directory against the discovery copy served at
`insumermodel.com/.well-known/state-attestation-test-vectors.json`, field by field on everything
signed, so the two cannot drift apart unnoticed. This directory is the authority if they ever do.

## Regenerating

These are frozen artifacts, not a live test suite. To produce a fresh equivalent, call
`POST /v1/attest` with the same conditions (or `POST /v1/trust` with the wallet alone, for the
trust vectors) and a key of your own, and keep the response verbatim. The endpoint is open: a call with no API key returns a 402 carrying an x402 offer,
and there is a free key path that takes an email.
