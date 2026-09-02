# InsumerAPI attestation test vectors

Seventeen attestations issued by InsumerAPI, saved exactly as the API returned them, each
paired with the result a correct verifier must produce. Six of them are deliberately corrupted
or presented under conditions that must be refused.

```bash
npm install insumer-verify @noble/post-quantum
node run.mjs
```

`@noble/post-quantum` is what lets the verifier check the ML-DSA-65 companion. Without it the
companion is reported as `unverifiable` rather than `verified`, so vectors 12, 13 and 17 will not
match their expectations, and vector 14 (a tampered companion) can no longer be refuted. The
runner needs `insumer-verify` 1.8.1 or later; 1.8.0 reports the companion on attestations but not
on trust profiles.

`run.mjs` exits 0 only if every vector produces exactly its stated expectation.

## What each vector contains

| Field | Meaning |
|---|---|
| `response` | The API response, verbatim. Nothing reformatted, reordered or trimmed. |
| `recompute` | For each result: the canonical `evaluatedCondition` byte string, the claimed `conditionHash`, whether the hash reproduces from those bytes, and the chain anchor. |
| `options` | The verifier options this vector is evaluated under. Pinned per vector, because a verdict is a function of the input and the options together. |
| `expected` | The five verdicts a correct verifier must produce (signature, condition hashes, freshness, expiry, post-quantum companion), the companion's status (`verified`, `refuted`, `absent`, `unverifiable`), and where relevant the `pass` and per-result `met` values. |

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

Vectors 08 to 11 are the point. A set where everything passes demonstrates very little; the
question a verifier has to answer correctly is which artifacts it refuses.

Three of them are chosen to be hard to pass by accident:

- **09** breaks the signature without touching the condition, so a verifier that collapses
  signature failure and hash integrity into one boolean gets the hash answer wrong.
- **10** is the inverse of 08: the hash is inside the signed payload, so editing the claimed
  hash breaks the signature too.
- **11** must fail rather than fall back to another key in the JWKS. A verifier that selects
  the first key when the `kid` matches nothing will happily check an unknown or forged `kid`
  against whichever key is listed first. `insumer-verify` throws here from 1.7.0 onward.

## Two things that will look wrong and are not

**Every vector fails the expiry check.** An attestation carries a 30-minute freshness window,
so any published vector is past it. That is not a defect in the vector and it is not a
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
checked against the block at that height.

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
and Stellar, `checkpointSequence` on Sui.

Vectors 01 to 12 and 14 to 17 are signed under the v2 scheme. Vector 13 is signed under the v1
scheme (the frozen bare-JSON preimage under `insumer-attest-v1`) and carries the same companion,
because keys issued before the v2 rollout still sign v1 and remain verifiable unchanged; that is
a live path rather than a historical one. A verifier that implements only v2 passes sixteen
vectors here and fails vector 13, which the specification requires it to select by `kid`.

Vectors 12 to 17 exercise the post-quantum companion (spec Section 12, Check 6). Its verdict is
reported separately from the classical checks: `refuted` always fails the artifact; `absent` and
`unverifiable` fail only under the verifier's own `pqRequiredFrom` cutoff, judged by the
verifier's clock, never by a timestamp inside the artifact.

## Wallets

Ethereum and Base vectors use `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` (vitalik.eth), the
address used throughout the InsumerAPI examples. The Bitcoin vector uses the genesis address
`1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`. Both are public, permanent and hold real balances, so
the vectors disclose nothing that was not already public.

## The envelope fixtures

`envelope/` holds fixtures for the multi-attestation envelope in `MULTI-ATTESTATION-SPEC.md`.
Those test composition, whether one bad entry changes another entry's verdict, rather than
whether a single attestation is genuine.

## Regenerating

These are frozen artifacts, not a live test suite. To produce a fresh equivalent, call
`POST /v1/attest` with the same conditions and a key of your own, and keep the response
verbatim. The endpoint is open: a call with no API key returns a 402 carrying an x402 offer,
and there is a free key path that takes an email.
